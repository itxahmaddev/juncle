use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use sysinfo::{Disks, ProcessesToUpdate, System};
use walkdir::WalkDir;
use winreg::enums::*;
use winreg::RegKey;

// ───────────────────────── Junk categories ─────────────────────────

struct Category {
    id: &'static str,
    name: &'static str,
    desc: &'static str,
    roots: Vec<PathBuf>,
    /// Only files whose name starts with this prefix are junk (None = everything).
    prefix: Option<&'static str>,
    recycle_bin: bool,
}

fn env_path(var: &str) -> Option<PathBuf> {
    std::env::var_os(var).map(PathBuf::from)
}

fn categories() -> Vec<Category> {
    let local = env_path("LOCALAPPDATA").unwrap_or_default();
    let windir = env_path("WINDIR").unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    let progdata = env_path("PROGRAMDATA").unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));

    // Firefox keeps one cache folder per profile.
    let mut firefox = vec![];
    if let Ok(rd) = fs::read_dir(local.join(r"Mozilla\Firefox\Profiles")) {
        for e in rd.flatten() {
            firefox.push(e.path().join("cache2"));
        }
    }

    let chromium = |base: &str| -> Vec<PathBuf> {
        let ud = local.join(base).join("User Data").join("Default");
        ["Cache", "Code Cache", "GPUCache"]
            .iter()
            .map(|s| ud.join(s))
            .collect()
    };

    vec![
        Category {
            id: "user_temp",
            name: "User temporary files",
            desc: "Leftovers in your %TEMP% folder",
            roots: vec![std::env::temp_dir()],
            prefix: None,
            recycle_bin: false,
        },
        Category {
            id: "win_temp",
            name: "Windows temporary files",
            desc: "C:\\Windows\\Temp (may need Administrator)",
            roots: vec![windir.join("Temp")],
            prefix: None,
            recycle_bin: false,
        },
        Category {
            id: "prefetch",
            name: "Prefetch data",
            desc: "Old application launch traces (needs Administrator)",
            roots: vec![windir.join("Prefetch")],
            prefix: None,
            recycle_bin: false,
        },
        Category {
            id: "win_update",
            name: "Windows Update downloads",
            desc: "Cached update installers (needs Administrator)",
            roots: vec![windir.join(r"SoftwareDistribution\Download")],
            prefix: None,
            recycle_bin: false,
        },
        Category {
            id: "thumbs",
            name: "Thumbnail cache",
            desc: "Explorer picture previews",
            roots: vec![local.join(r"Microsoft\Windows\Explorer")],
            prefix: Some("thumbcache_"),
            recycle_bin: false,
        },
        Category {
            id: "chrome",
            name: "Google Chrome cache",
            desc: "Cached web pages and images",
            roots: chromium("Google\\Chrome"),
            prefix: None,
            recycle_bin: false,
        },
        Category {
            id: "edge",
            name: "Microsoft Edge cache",
            desc: "Cached web pages and images",
            roots: chromium("Microsoft\\Edge"),
            prefix: None,
            recycle_bin: false,
        },
        Category {
            id: "firefox",
            name: "Mozilla Firefox cache",
            desc: "Cached web pages and images",
            roots: firefox,
            prefix: None,
            recycle_bin: false,
        },
        Category {
            id: "dumps",
            name: "Crash dumps & error reports",
            desc: "Memory dumps and Windows Error Reporting files",
            roots: vec![
                local.join("CrashDumps"),
                local.join(r"Microsoft\Windows\WER"),
                progdata.join(r"Microsoft\Windows\WER"),
            ],
            prefix: None,
            recycle_bin: false,
        },
        Category {
            id: "recycle",
            name: "Recycle Bin",
            desc: "Deleted files waiting to be removed",
            roots: vec![],
            prefix: None,
            recycle_bin: true,
        },
    ]
}

fn dir_stats(cat: &Category) -> (u64, u64) {
    let (mut size, mut files) = (0u64, 0u64);
    for root in &cat.roots {
        for e in WalkDir::new(root).into_iter().flatten() {
            if !e.file_type().is_file() {
                continue;
            }
            if let Some(p) = cat.prefix {
                if !e.file_name().to_string_lossy().starts_with(p) {
                    continue;
                }
            }
            if let Ok(m) = e.metadata() {
                size += m.len();
                files += 1;
            }
        }
    }
    (size, files)
}

fn recycle_stats() -> (u64, u64) {
    use windows_sys::Win32::UI::Shell::{SHQueryRecycleBinW, SHQUERYRBINFO};
    let mut info = SHQUERYRBINFO {
        cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
        i64Size: 0,
        i64NumItems: 0,
    };
    let hr = unsafe { SHQueryRecycleBinW(std::ptr::null(), &mut info) };
    if hr == 0 {
        (info.i64Size.max(0) as u64, info.i64NumItems.max(0) as u64)
    } else {
        (0, 0)
    }
}

fn empty_recycle_bin() -> bool {
    use windows_sys::Win32::UI::Shell::{
        SHEmptyRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND,
    };
    let hr = unsafe {
        SHEmptyRecycleBinW(
            std::ptr::null_mut(),
            std::ptr::null(),
            SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND,
        )
    };
    hr == 0
}

#[derive(Serialize)]
struct ScanItem {
    id: String,
    name: String,
    desc: String,
    size: u64,
    files: u64,
}

#[derive(Serialize)]
struct CleanResult {
    freed: u64,
    deleted: u64,
    failed: u64,
}

#[tauri::command]
async fn scan_junk() -> Vec<ScanItem> {
    tauri::async_runtime::spawn_blocking(|| {
        categories()
            .iter()
            .map(|c| {
                let (size, files) = if c.recycle_bin {
                    recycle_stats()
                } else {
                    dir_stats(c)
                };
                ScanItem {
                    id: c.id.into(),
                    name: c.name.into(),
                    desc: c.desc.into(),
                    size,
                    files,
                }
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
async fn clean_junk(ids: Vec<String>) -> CleanResult {
    tauri::async_runtime::spawn_blocking(move || {
        let mut res = CleanResult {
            freed: 0,
            deleted: 0,
            failed: 0,
        };
        for cat in categories()
            .iter()
            .filter(|c| ids.iter().any(|i| i == c.id))
        {
            if cat.recycle_bin {
                let (size, files) = recycle_stats();
                if empty_recycle_bin() {
                    res.freed += size;
                    res.deleted += files;
                }
                continue;
            }
            for root in &cat.roots {
                // contents_first: files before their folders, so empty folders can go too.
                for e in WalkDir::new(root)
                    .contents_first(true)
                    .into_iter()
                    .flatten()
                {
                    if e.depth() == 0 {
                        continue;
                    }
                    if e.file_type().is_dir() {
                        let _ = fs::remove_dir(e.path()); // only succeeds when empty
                        continue;
                    }
                    if let Some(p) = cat.prefix {
                        if !e.file_name().to_string_lossy().starts_with(p) {
                            continue;
                        }
                    }
                    let len = e.metadata().map(|m| m.len()).unwrap_or(0);
                    match fs::remove_file(e.path()) {
                        Ok(_) => {
                            res.freed += len;
                            res.deleted += 1;
                        }
                        Err(_) => res.failed += 1, // in use or access denied
                    }
                }
            }
        }
        res
    })
    .await
    .unwrap_or(CleanResult {
        freed: 0,
        deleted: 0,
        failed: 0,
    })
}

// ───────────────────────── Memory ─────────────────────────

#[derive(Serialize)]
struct ProcInfo {
    pid: u32,
    name: String,
    memory: u64,
}

#[derive(Serialize)]
struct MemInfo {
    total: u64,
    used: u64,
    available: u64,
    swap_total: u64,
    swap_used: u64,
    top: Vec<ProcInfo>,
}

fn read_memory() -> MemInfo {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let mut top: Vec<ProcInfo> = sys
        .processes()
        .iter()
        .map(|(pid, p)| ProcInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().into_owned(),
            memory: p.memory(),
        })
        .collect();
    top.sort_by(|a, b| b.memory.cmp(&a.memory));
    top.truncate(15);
    MemInfo {
        total: sys.total_memory(),
        used: sys.used_memory(),
        available: sys.available_memory(),
        swap_total: sys.total_swap(),
        swap_used: sys.used_swap(),
        top,
    }
}

#[tauri::command]
async fn memory_info() -> MemInfo {
    tauri::async_runtime::spawn_blocking(read_memory)
        .await
        .unwrap()
}

#[derive(Serialize)]
struct BoostResult {
    before: u64,
    after: u64,
    trimmed: u32,
}

/// Asks Windows to trim the working set of every process we're allowed to touch.
/// Pages are moved to the standby list; nothing is killed or lost.
#[tauri::command]
async fn optimize_memory() -> BoostResult {
    tauri::async_runtime::spawn_blocking(|| {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::ProcessStatus::K32EmptyWorkingSet;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA,
        };

        let mut sys = System::new();
        sys.refresh_memory();
        let before = sys.used_memory();
        sys.refresh_processes(ProcessesToUpdate::All, true);

        let mut trimmed = 0u32;
        for pid in sys.processes().keys() {
            let pid = pid.as_u32();
            if pid == 0 || pid == 4 {
                continue;
            }
            unsafe {
                let h = OpenProcess(
                    PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION,
                    0,
                    pid,
                );
                if h.is_null() {
                    continue;
                }
                if K32EmptyWorkingSet(h) != 0 {
                    trimmed += 1;
                }
                CloseHandle(h);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(800));
        sys.refresh_memory();
        BoostResult {
            before,
            after: sys.used_memory(),
            trimmed,
        }
    })
    .await
    .unwrap()
}

// ───────────────────────── Disks & large files ─────────────────────────

#[derive(Serialize)]
struct DiskInfo {
    name: String,
    mount: String,
    fs: String,
    total: u64,
    free: u64,
}

#[tauri::command]
fn disk_info() -> Vec<DiskInfo> {
    Disks::new_with_refreshed_list()
        .iter()
        .map(|d| DiskInfo {
            name: d.name().to_string_lossy().into_owned(),
            mount: d.mount_point().to_string_lossy().into_owned(),
            fs: d.file_system().to_string_lossy().into_owned(),
            total: d.total_space(),
            free: d.available_space(),
        })
        .collect()
}

#[derive(Serialize)]
struct BigFile {
    path: String,
    size: u64,
}

fn home_dir() -> Option<PathBuf> {
    env_path("USERPROFILE")
}

#[tauri::command]
async fn find_large_files(min_mb: u64) -> Vec<BigFile> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(home) = home_dir() else {
            return vec![];
        };
        let min = min_mb.max(1) * 1024 * 1024;
        let mut found = vec![];
        for sub in [
            "Downloads",
            "Documents",
            "Desktop",
            "Videos",
            "Pictures",
            "Music",
        ] {
            for e in WalkDir::new(home.join(sub)).into_iter().flatten() {
                if e.file_type().is_file() {
                    if let Ok(m) = e.metadata() {
                        if m.len() >= min {
                            found.push(BigFile {
                                path: e.path().to_string_lossy().into_owned(),
                                size: m.len(),
                            });
                        }
                    }
                }
            }
        }
        found.sort_by(|a, b| b.size.cmp(&a.size));
        found.truncate(100);
        found
    })
    .await
    .unwrap_or_default()
}

/// Permanently deletes files, but only regular files inside the user's profile.
#[tauri::command]
fn delete_files(paths: Vec<String>) -> CleanResult {
    let mut res = CleanResult {
        freed: 0,
        deleted: 0,
        failed: 0,
    };
    let Some(home) = home_dir().and_then(|h| h.canonicalize().ok()) else {
        res.failed = paths.len() as u64;
        return res;
    };
    for p in paths {
        let ok = Path::new(&p)
            .canonicalize()
            .ok()
            .filter(|c| c.starts_with(&home) && c.is_file())
            .and_then(|c| {
                let len = fs::metadata(&c).map(|m| m.len()).unwrap_or(0);
                fs::remove_file(&c).ok().map(|_| len)
            });
        match ok {
            Some(len) => {
                res.freed += len;
                res.deleted += 1;
            }
            None => res.failed += 1,
        }
    }
    res
}

// ───────────────────────── Startup manager ─────────────────────────

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const OFF_KEY: &str = r"Software\Juncle\DisabledStartup";

#[derive(Serialize)]
struct StartupItem {
    name: String,
    command: String,
    enabled: bool,
}

#[tauri::command]
fn list_startup() -> Vec<StartupItem> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let mut items = vec![];
    for (key, enabled) in [(RUN_KEY, true), (OFF_KEY, false)] {
        if let Ok(k) = hkcu.open_subkey(key) {
            for (name, _) in k.enum_values().flatten() {
                let command: String = k.get_value(&name).unwrap_or_default();
                items.push(StartupItem {
                    name,
                    command,
                    enabled,
                });
            }
        }
    }
    items.sort_by_key(|i| i.name.to_lowercase());
    items
}

/// Disabling moves the entry to a Juncle-owned key, so it can always be restored.
#[tauri::command]
fn set_startup(name: String, enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (src, dst) = if enabled {
        (OFF_KEY, RUN_KEY)
    } else {
        (RUN_KEY, OFF_KEY)
    };
    let src_key = hkcu
        .open_subkey_with_flags(src, KEY_ALL_ACCESS)
        .map_err(|e| e.to_string())?;
    let command: String = src_key.get_value(&name).map_err(|e| e.to_string())?;
    let (dst_key, _) = hkcu.create_subkey(dst).map_err(|e| e.to_string())?;
    dst_key
        .set_value(&name, &command)
        .map_err(|e| e.to_string())?;
    src_key.delete_value(&name).map_err(|e| e.to_string())
}

// ───────────────────────── Entry ─────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_junk,
            clean_junk,
            memory_info,
            optimize_memory,
            disk_info,
            find_large_files,
            delete_files,
            list_startup,
            set_startup
        ])
        .run(tauri::generate_context!())
        .expect("error while running Juncle");
}
