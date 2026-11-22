// The desktop side of the transfer: a tiny HTTP server that only runs while the Transfer page is open.
//   GET  /ping                 checks the code
//   GET  /manifest             the library listing (built by the page)
//   GET  /file/<name>          a song or cover of the library
//   POST /upload/<name>        a file sent by the phone, stored in Bragi/incoming/
//   POST /done                 tells the page that everything was uploaded
// Every request needs ?pin=<code>.

use std::fs::{self, File};
use std::io::{self, Read};
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State};
use tiny_http::{Header, Method, Request, Response, Server};

const PREFERRED_PORT: u16 = 47831;           // same port every time, so the phone can remember the address
const MAX_BAD_PINS: u32 = 10;
const MAX_UPLOAD: u64 = 4 * 1024 * 1024 * 1024;

struct Ctx {
    pin: String,
    manifest: String,
    bragi: PathBuf,
    incoming: PathBuf,
    bad_pins: AtomicU32,
    app: AppHandle,
}

#[derive(Default)]
pub struct TransferState(Mutex<Option<Arc<Server>>>);

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).unwrap()
}

fn cors<R: Read>(response: Response<R>) -> Response<R> {
    response
        .with_header(header("Access-Control-Allow-Origin", "*"))
        .with_header(header("Access-Control-Allow-Headers", "*"))
        .with_header(header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"))
        .with_header(header("Access-Control-Allow-Private-Network", "true"))
}

fn reply(request: Request, code: u16, body: &str) {
    let _ = request.respond(cors(Response::from_string(body).with_status_code(code)));
}

// only plain file names: no folders, no "..", nothing hidden
fn safe_name(name: &str) -> Option<&str> {
    let ok = !name.is_empty()
        && name.len() <= 140
        && !name.starts_with('.')
        && !name.contains("..")
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if ok { Some(name) } else { None }
}

fn local_ip() -> String {
    // connecting a UDP socket sends nothing: it only makes the system pick the network card to use
    for target in ["8.8.8.8:80", "192.168.1.1:80", "192.168.0.1:80", "10.0.0.1:80"] {
        if let Ok(ip) = UdpSocket::bind("0.0.0.0:0").and_then(|s| {
            s.connect(target)?;
            s.local_addr()
        }) {
            return ip.ip().to_string();
        }
    }
    "127.0.0.1".to_string()
}

fn serve_file(ctx: &Ctx, request: Request, name: &str) {
    let Some(name) = safe_name(name) else { return reply(request, 400, "bad name") };
    let folder = if name.ends_with(".jpg") { "covers" } else { "songs" };
    match File::open(ctx.bragi.join(folder).join(name)) {
        Ok(file) => {
            let response = Response::from_file(file).with_header(header("Content-Type", "application/octet-stream"));
            let _ = request.respond(cors(response));
        }
        Err(_) => reply(request, 404, "not found"),
    }
}

fn save_upload(ctx: &Ctx, mut request: Request, name: &str) {
    let Some(name) = safe_name(name) else { return reply(request, 400, "bad name") };
    if fs::create_dir_all(&ctx.incoming).is_err() {
        return reply(request, 500, "cannot create the folder");
    }
    let result = File::create(ctx.incoming.join(name))
        .and_then(|mut out| io::copy(&mut request.as_reader().take(MAX_UPLOAD), &mut out));
    match result {
        Ok(_) => reply(request, 200, "ok"),
        Err(e) => reply(request, 500, &e.to_string()),
    }
}

fn handle(ctx: &Ctx, request: Request) {
    // the browser's permission check before a cross-origin request
    if *request.method() == Method::Options {
        let _ = request.respond(cors(Response::empty(204)));
        return;
    }

    let url = request.url().to_string();
    let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));

    if ctx.bad_pins.load(Ordering::Relaxed) >= MAX_BAD_PINS {
        return reply(request, 429, "too many wrong codes");
    }
    let pin_ok = query.split('&').any(|kv| kv.strip_prefix("pin=") == Some(ctx.pin.as_str()));
    if !pin_ok {
        ctx.bad_pins.fetch_add(1, Ordering::Relaxed);
        return reply(request, 403, "wrong code");
    }

    let method = request.method().clone();
    match (method, path) {
        (Method::Get, "/ping") => reply(request, 200, "ok"),
        (Method::Get, "/manifest") => {
            let response = Response::from_string(ctx.manifest.clone()).with_header(header("Content-Type", "application/json"));
            let _ = request.respond(cors(response));
        }
        (Method::Get, p) if p.starts_with("/file/") => serve_file(ctx, request, &p["/file/".len()..]),
        (Method::Post, p) if p.starts_with("/upload/") => save_upload(ctx, request, &p["/upload/".len()..]),
        (Method::Post, "/done") => {
            let _ = ctx.app.emit("transfer-received", ());
            reply(request, 200, "ok");
        }
        _ => reply(request, 404, "not found"),
    }
}

fn stop_server(state: &TransferState) {
    if let Some(server) = state.0.lock().unwrap().take() {
        server.unblock();   // ends the loop below, which drops the server and frees the port
    }
}

// starts (or restarts) the server; returns "ip:port"
#[tauri::command]
pub fn transfer_start(app: AppHandle, state: State<'_, TransferState>, pin: String, manifest: String) -> Result<String, String> {
    stop_server(&state);

    let bragi = app.path().home_dir().map_err(|e| e.to_string())?.join("Bragi");
    let incoming = bragi.join("incoming");
    let _ = fs::remove_dir_all(&incoming);
    fs::create_dir_all(&incoming).map_err(|e| e.to_string())?;

    let server = Server::http(("0.0.0.0", PREFERRED_PORT))
        .or_else(|_| Server::http(("0.0.0.0", 0)))   // preferred port busy: any free one
        .map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("could not read the port")?;

    let server = Arc::new(server);
    *state.0.lock().unwrap() = Some(server.clone());

    let ctx = Arc::new(Ctx { pin, manifest, bragi, incoming, bad_pins: AtomicU32::new(0), app });
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let ctx = ctx.clone();
            std::thread::spawn(move || handle(&ctx, request));
        }
    });

    Ok(format!("{}:{}", local_ip(), port))
}

#[tauri::command]
pub fn transfer_stop(state: State<'_, TransferState>) {
    stop_server(&state);
}

// empties Bragi/incoming once its content has been imported
#[tauri::command]
pub fn transfer_clear_incoming(app: AppHandle) -> Result<(), String> {
    let incoming = app.path().home_dir().map_err(|e| e.to_string())?.join("Bragi").join("incoming");
    let _ = fs::remove_dir_all(&incoming);
    fs::create_dir_all(&incoming).map_err(|e| e.to_string())
}