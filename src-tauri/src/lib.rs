#[cfg(target_os = "windows")]
fn style_host_window(hwnd: *mut std::ffi::c_void) {
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWCP_DONOTROUND: u32 = 1;
    const DWMWA_COLOR_NONE: u32 = 0xffff_fffe;

    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut std::ffi::c_void,
            attribute: u32,
            value: *const std::ffi::c_void,
            size: u32,
        ) -> i32;
    }

    unsafe {
        let preference = DWMWCP_DONOTROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &preference as *const _ as *const std::ffi::c_void,
            std::mem::size_of_val(&preference) as u32,
        );
        let border_color = DWMWA_COLOR_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &border_color as *const _ as *const std::ffi::c_void,
            std::mem::size_of_val(&border_color) as u32,
        );
    }
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
unsafe extern "system" {
    fn SetWindowPos(
        hwnd: *mut std::ffi::c_void,
        insert_after: *mut std::ffi::c_void,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        flags: u32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn set_smooth_window_position(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
) -> Result<(), String> {
    use tauri::Manager;

    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
    let moved = unsafe {
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            x,
            y,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        )
    };

    if moved == 0 {
        Err(format!(
            "Could not move window: {}",
            std::io::Error::last_os_error()
        ))
    } else {
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_smooth_window_position(_x: i32, _y: i32) -> Result<(), String> {
    Err("Smooth window movement is supported on Windows only".into())
}

#[cfg(target_os = "windows")]
const CURSOR_KEY: &str = r"HKCU\Control Panel\Cursors";

#[cfg(target_os = "windows")]
pub(crate) const ROLE_REGISTRY: [(&str, &str); 17] = [
    ("arrow", "Arrow"),
    ("help", "Help"),
    ("workingInBackground", "AppStarting"),
    ("busy", "Wait"),
    ("precisionSelect", "Crosshair"),
    ("textSelect", "IBeam"),
    ("handwriting", "NWPen"),
    ("unavailable", "No"),
    ("verticalResize", "SizeNS"),
    ("horizontalResize", "SizeWE"),
    ("diagonalResize1", "SizeNWSE"),
    ("diagonalResize2", "SizeNESW"),
    ("move", "SizeAll"),
    ("alternateSelect", "UpArrow"),
    ("linkSelect", "Hand"),
    ("personSelect", "Person"),
    ("locationSelect", "Pin"),
];

#[cfg(target_os = "windows")]
#[derive(Clone, serde::Deserialize, serde::Serialize)]
pub(crate) struct LocalCatalog {
    packs: Vec<LocalPack>,
}

#[cfg(target_os = "windows")]
#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalPack {
    id: String,
    name: String,
    folder: String,
    author: String,
    author_url: String,
    license: Option<String>,
    #[serde(default)]
    fingerprint: String,
    preview: String,
    roles: std::collections::HashMap<String, LocalRole>,
    #[serde(default)]
    user: bool,
}

#[cfg(target_os = "windows")]
#[derive(Clone, serde::Deserialize, serde::Serialize)]
pub(crate) struct LocalRole {
    file: String,
    preview: String,
    hover: String,
    hotspot: [u16; 2],
}

#[cfg(target_os = "windows")]
const DEFAULT_CURSORS: [(&str, &str); 17] = [
    ("Arrow", "aero_arrow.cur"),
    ("Help", "aero_helpsel.cur"),
    ("AppStarting", "aero_working.ani"),
    ("Wait", "aero_busy.ani"),
    ("Crosshair", ""),
    ("IBeam", ""),
    ("NWPen", "aero_pen.cur"),
    ("No", "aero_unavail.cur"),
    ("SizeNS", "aero_ns.cur"),
    ("SizeWE", "aero_ew.cur"),
    ("SizeNWSE", "aero_nwse.cur"),
    ("SizeNESW", "aero_nesw.cur"),
    ("SizeAll", "aero_move.cur"),
    ("UpArrow", "aero_up.cur"),
    ("Hand", "aero_link.cur"),
    ("Person", "aero_person.cur"),
    ("Pin", "aero_pin.cur"),
];

#[cfg(target_os = "windows")]
fn run_reg(arguments: Vec<String>) -> Result<(), String> {
    let output = std::process::Command::new("reg.exe")
        .args(arguments)
        .output()
        .map_err(|error| format!("Could not start Windows Registry tool: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if message.is_empty() {
            "Windows Registry update failed".to_string()
        } else {
            message
        })
    }
}

#[cfg(target_os = "windows")]
fn registry_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(target_os = "windows")]
fn import_cursor_scheme(
    app: &tauri::AppHandle,
    scheme_name: &str,
    cursors: &[(&str, Option<std::path::PathBuf>)],
) -> Result<(), String> {
    use tauri::Manager;

    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Scheme directory is unavailable: {error}"))?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create scheme directory: {error}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let file = directory.join(format!("cursor-scheme-{stamp}.reg"));
    let mut content = format!(
        "Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Control Panel\\Cursors]\r\n@=\"{}\"\r\n",
        registry_string(scheme_name)
    );
    for (name, path) in cursors {
        let value = path
            .as_ref()
            .map(|path| path.to_string_lossy())
            .unwrap_or_default();
        content.push_str(&format!(
            "\"{}\"=\"{}\"\r\n",
            registry_string(name),
            registry_string(&value)
        ));
    }
    let encoded = std::iter::once(0xfeff)
        .chain(content.encode_utf16())
        .flat_map(u16::to_le_bytes)
        .collect::<Vec<_>>();
    std::fs::write(&file, encoded)
        .map_err(|error| format!("Could not write cursor scheme: {error}"))?;
    let result = run_reg(vec!["import".into(), file.to_string_lossy().into_owned()]);
    let _ = std::fs::remove_file(file);
    result?;
    reload_windows_cursors()
}

#[cfg(target_os = "windows")]
fn reload_windows_cursors() -> Result<(), String> {
    const SPI_SETCURSORS: u32 = 0x0057;

    #[link(name = "user32")]
    unsafe extern "system" {
        fn SystemParametersInfoW(
            action: u32,
            parameter: u32,
            value: *mut std::ffi::c_void,
            flags: u32,
        ) -> i32;
    }

    if unsafe { SystemParametersInfoW(SPI_SETCURSORS, 0, std::ptr::null_mut(), 0) } == 0 {
        Err(format!(
            "Windows could not reload cursors: {}",
            std::io::Error::last_os_error()
        ))
    } else {
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn load_catalog(app: &tauri::AppHandle) -> Result<LocalCatalog, String> {
    use tauri::Manager;

    if let Ok(root) = app.path().app_data_dir() {
        let legacy = root.join("bundled-cursors");
        if legacy.is_dir() {
            let _ = std::fs::remove_dir_all(legacy);
        }
    }
    importer::load_user_catalog(app)
}

#[cfg(target_os = "windows")]
fn catalog_pack<'a>(catalog: &'a LocalCatalog, pack_id: &str) -> Result<&'a LocalPack, String> {
    catalog
        .packs
        .iter()
        .find(|pack| pack.id == pack_id)
        .ok_or_else(|| "Cursor pack is not in the local catalog".to_string())
}

#[cfg(target_os = "windows")]
fn validated_cursor_paths(
    root: &std::path::Path,
    pack: &LocalPack,
) -> Result<Vec<(&'static str, Option<std::path::PathBuf>)>, String> {
    let root = std::fs::canonicalize(root)
        .map_err(|error| format!("Cursor root is unavailable: {error}"))?;
    let pack_root = std::fs::canonicalize(root.join(&pack.folder))
        .map_err(|error| format!("Cursor pack folder is unavailable: {error}"))?;
    if !pack_root.starts_with(&root) {
        return Err("Cursor pack path escaped the local cursor root".into());
    }

    let mut cursors = Vec::with_capacity(ROLE_REGISTRY.len());
    for (index, (role, registry_name)) in ROLE_REGISTRY.iter().enumerate() {
        let Some(entry) = pack.roles.get(*role) else {
            if index < 15 {
                return Err(format!("Cursor pack is missing required role: {role}"));
            }
            cursors.push((*registry_name, None));
            continue;
        };
        let path = std::fs::canonicalize(pack_root.join(&entry.file))
            .map_err(|_| format!("Missing cursor file: {}", entry.file))?;
        let valid_type = matches!(
            path.extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("cur" | "ani")
        );
        if !path.starts_with(&pack_root) || !valid_type || !path.is_file() {
            return Err(format!("Invalid cursor file: {}", entry.file));
        }
        cursors.push((*registry_name, Some(path)));
    }
    Ok(cursors)
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn apply_cursor_pack(app: tauri::AppHandle, pack_id: String) -> Result<(), String> {
    use tauri::Manager;

    let catalog = load_catalog(&app)?;
    let pack = catalog_pack(&catalog, &pack_id)?;
    let root = importer::imported_pack_root(&app, "")?;
    let cursors = validated_cursor_paths(&root, pack)?;

    let backup_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Backup directory is unavailable: {error}"))?;
    std::fs::create_dir_all(&backup_directory)
        .map_err(|error| format!("Could not create backup directory: {error}"))?;
    let backup = backup_directory.join("cursor-scheme-backup.reg");

    if !backup.exists() {
        run_reg(vec![
            "export".into(),
            CURSOR_KEY.into(),
            backup.to_string_lossy().into_owned(),
            "/y".into(),
        ])?;
    }

    if let Err(error) = import_cursor_scheme(&app, &pack.name, &cursors) {
        let _ = run_reg(vec!["import".into(), backup.to_string_lossy().into_owned()]);
        let _ = reload_windows_cursors();
        return Err(error);
    }

    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn install_remote_cursor_pack(
    app: tauri::AppHandle,
    pack_id: String,
    package_bytes: Vec<u8>,
    expected_bytes: usize,
    package_sha256: String,
    manifest_hash: String,
    fingerprint: String,
) -> Result<(), String> {
    importer::install_remote_package(
        &app,
        &pack_id,
        &package_bytes,
        expected_bytes,
        &package_sha256,
        &manifest_hash,
        &fingerprint,
    )
}

#[cfg(target_os = "windows")]
fn validate_cursor_files(
    directory: &std::path::Path,
    cursors: &[(&str, &str)],
) -> Result<(), String> {
    for (_, file) in cursors {
        if file.is_empty() {
            continue;
        }
        let path = directory.join(file);
        let valid_type = matches!(
            path.extension().and_then(|extension| extension.to_str()),
            Some("cur" | "ani")
        );
        if !valid_type || !path.is_file() {
            return Err(format!("Missing or invalid cursor file: {file}"));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn restore_windows_default_cursors(app: tauri::AppHandle) -> Result<(), String> {
    let cursor_directory = std::env::var_os("WINDIR")
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "Windows directory is unavailable".to_string())?
        .join("Cursors");

    validate_cursor_files(&cursor_directory, &DEFAULT_CURSORS)?;
    let cursors = DEFAULT_CURSORS
        .iter()
        .map(|(name, file)| {
            (
                *name,
                (!file.is_empty()).then(|| cursor_directory.join(file)),
            )
        })
        .collect::<Vec<_>>();
    import_cursor_scheme(&app, "Windows Aero", &cursors)
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn open_creator_profile(app: tauri::AppHandle, pack_id: String) -> Result<(), String> {
    let catalog = load_catalog(&app)?;
    let pack = catalog_pack(&catalog, &pack_id)?;
    if !pack.author_url.starts_with("https://www.deviantart.com/") {
        return Err("Creator profile is not an allowed DeviantArt URL".into());
    }
    std::process::Command::new("explorer.exe")
        .arg(&pack.author_url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open creator profile: {error}"))
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn list_cursor_packs(app: tauri::AppHandle) -> Result<LocalCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || load_catalog(&app))
        .await
        .map_err(|error| format!("Cursor catalog task failed: {error}"))?
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn import_cursor_folder(app: tauri::AppHandle, path: String) -> Result<LocalCatalog, String> {
    importer::import_folder(&app, std::path::Path::new(&path))?;
    load_catalog(&app)
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn open_cursor_library(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let library = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cursor library is unavailable: {error}"))?
        .join("cursor-imports");
    std::fs::create_dir_all(&library)
        .map_err(|error| format!("Could not create cursor library: {error}"))?;
    std::process::Command::new("explorer.exe")
        .arg(&library)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open cursor library: {error}"))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn apply_cursor_pack(_pack_id: String) -> Result<(), String> {
    Err("Cursor schemes are supported on Windows only".into())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn install_remote_cursor_pack(
    _pack_id: String,
    _package_bytes: Vec<u8>,
    _expected_bytes: usize,
    _package_sha256: String,
    _manifest_hash: String,
    _fingerprint: String,
) -> Result<(), String> {
    Err("Cursor schemes are supported on Windows only".into())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn restore_windows_default_cursors(_app: tauri::AppHandle) -> Result<(), String> {
    Err("Cursor schemes are supported on Windows only".into())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn open_creator_profile(_pack_id: String) -> Result<(), String> {
    Err("Opening creator profiles is supported on Windows only".into())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn list_cursor_packs() -> Result<LocalCatalog, String> {
    Err("Cursor catalogs are supported on Windows only".into())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn import_cursor_folder(_path: String) -> Result<LocalCatalog, String> {
    Err("Cursor folder import is supported on Windows only".into())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn open_cursor_library() -> Result<(), String> {
    Err("Cursor library is supported on Windows only".into())
}

fn fresh_companion_launch() -> bool {
    std::env::args().skip(1).any(|argument| {
        argument
            .strip_prefix("beepocursors://apply/")
            .is_some_and(|pack_id| {
                !pack_id.is_empty()
                    && pack_id.len() <= 128
                    && pack_id.bytes().enumerate().all(|(index, byte)| {
                        byte.is_ascii_lowercase()
                            || byte.is_ascii_digit()
                            || (index > 0 && byte == b'-')
                    })
            })
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri_plugin_deep_link::DeepLinkExt;

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            apply_cursor_pack,
            install_remote_cursor_pack,
            restore_windows_default_cursors,
            open_creator_profile,
            list_cursor_packs,
            import_cursor_folder,
            open_cursor_library,
            set_smooth_window_position
        ])
        .setup(|app| {
            app.deep_link().register_all()?;

            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;

                if let Some(window) = app.get_webview_window("main") {
                    let (width, height) = if fresh_companion_launch() {
                        (320.0, 220.0)
                    } else {
                        (800.0, 560.0)
                    };
                    window.set_size(tauri::LogicalSize::new(width, height))?;
                    window.center()?;
                    style_host_window(window.hwnd()?.0);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Beepo Cursors");
}
mod importer;
