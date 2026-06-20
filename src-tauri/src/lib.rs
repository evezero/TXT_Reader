use encoding_rs::GBK;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

// ─── 数据结构 ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct FileReadResult {
    pub success: bool,
    pub content: Option<String>,
    pub size: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MetaReadResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct WriteResult {
    pub success: bool,
    pub error: Option<String>,
}

// ─── 编码检测与文件读取 ────────────────────────────────────────────────────

fn detect_and_decode(bytes: &[u8]) -> String {
    // 跳过 UTF-8 BOM
    let start = if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        3
    } else {
        0
    };
    let slice = &bytes[start..];

    // 先尝试 UTF-8
    let utf8_text = String::from_utf8_lossy(slice);
    let replacement_count = utf8_text.matches('\u{FFFD}').count();

    if replacement_count > 10 {
        // 可能不是 UTF-8，尝试 GBK
        let (decoded, _, _) = GBK.decode(slice);
        decoded.to_string()
    } else {
        utf8_text.to_string()
    }
}

// ─── Tauri 命令 ────────────────────────────────────────────────────────────

#[tauri::command]
fn read_file(path: String) -> FileReadResult {
    match fs::read(&path) {
        Ok(bytes) => {
            let size = bytes.len() as u64;
            let content = detect_and_decode(&bytes);
            FileReadResult {
                success: true,
                content: Some(content),
                size: Some(size),
                error: None,
            }
        }
        Err(e) => FileReadResult {
            success: false,
            content: None,
            size: None,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn read_meta(path: String) -> MetaReadResult {
    let meta_path = format!("{}.txtreader-meta.json", path);
    match fs::read_to_string(&meta_path) {
        Ok(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
            Ok(data) => MetaReadResult {
                success: true,
                data: Some(data),
            },
            Err(_) => MetaReadResult {
                success: false,
                data: None,
            },
        },
        Err(_) => MetaReadResult {
            success: false,
            data: None,
        },
    }
}

#[tauri::command]
fn write_meta(path: String, meta: serde_json::Value) -> WriteResult {
    let meta_path = format!("{}.txtreader-meta.json", path);
    match serde_json::to_string_pretty(&meta) {
        Ok(json_str) => match fs::write(&meta_path, json_str) {
            Ok(_) => WriteResult {
                success: true,
                error: None,
            },
            Err(e) => WriteResult {
                success: false,
                error: Some(e.to_string()),
            },
        },
        Err(e) => WriteResult {
            success: false,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn get_fonts() -> Vec<String> {
    vec![
        "微软雅黑".into(),
        "宋体".into(),
        "黑体".into(),
        "仿宋".into(),
        "楷体".into(),
        "华文楷体".into(),
        "华文宋体".into(),
        "Microsoft YaHei".into(),
        "SimSun".into(),
        "Arial".into(),
        "Georgia".into(),
        "Times New Roman".into(),
        "Verdana".into(),
        "Consolas".into(),
        "Segoe UI".into(),
    ]
}

#[tauri::command]
fn write_file(path: String, content: String) -> WriteResult {
    match fs::write(&path, content) {
        Ok(_) => WriteResult {
            success: true,
            error: None,
        },
        Err(e) => WriteResult {
            success: false,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn force_exit() {
    std::process::exit(0);
}

// ─── 应用启动 ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            read_meta,
            write_meta,
            file_exists,
            get_fonts,
            force_exit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
