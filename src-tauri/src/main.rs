#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use md5::{Digest, Md5};

#[tauri::command]
fn md5_upper_hex(input: String) -> String {
    let mut hasher = Md5::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize()).to_uppercase()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![md5_upper_hex])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
