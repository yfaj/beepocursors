#[cfg(target_os = "windows")]
use base64::Engine;
#[cfg(target_os = "windows")]
use sha2::{Digest, Sha256};
#[cfg(target_os = "windows")]
use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet},
    fs,
    hash::{Hash, Hasher},
    io::{Cursor, Read},
    path::{Path, PathBuf},
};
#[cfg(target_os = "windows")]
use tauri::Manager;

#[cfg(target_os = "windows")]
use super::{LocalCatalog, LocalPack, LocalRole, ROLE_REGISTRY};

#[cfg(target_os = "windows")]
const MAX_REMOTE_PACKAGE_BYTES: usize = 8 * 1024 * 1024;
#[cfg(target_os = "windows")]
const MAX_REMOTE_FILE_BYTES: usize = 4 * 1024 * 1024;

#[cfg(target_os = "windows")]
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteManifest {
    schema: u8,
    id: String,
    name: String,
    author: String,
    author_url: String,
    license: Option<String>,
    fingerprint: String,
    manifest_hash: String,
    version: String,
    roles: HashMap<String, RemoteManifestRole>,
}

#[cfg(target_os = "windows")]
#[derive(serde::Deserialize)]
struct RemoteManifestRole {
    file: String,
    sha256: String,
}

#[cfg(target_os = "windows")]
const ROLE_ALIASES: [(&str, &[&str]); 17] = [
    ("arrow", &["pointer", "arrow"]),
    ("help", &["help"]),
    ("workingInBackground", &["working", "work"]),
    ("busy", &["busy"]),
    ("precisionSelect", &["precision", "cross"]),
    ("textSelect", &["text"]),
    ("handwriting", &["handwrt", "hand"]),
    ("unavailable", &["unavailable", "unavailiable"]),
    ("verticalResize", &["vert"]),
    ("horizontalResize", &["horz"]),
    ("diagonalResize1", &["dgn1"]),
    ("diagonalResize2", &["dgn2"]),
    ("move", &["move"]),
    ("alternateSelect", &["alternate"]),
    ("linkSelect", &["link"]),
    ("personSelect", &["person"]),
    ("locationSelect", &["pin"]),
];

#[cfg(target_os = "windows")]
#[derive(Clone)]
struct CursorFrame {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

#[cfg(target_os = "windows")]
struct CursorImages {
    native: CursorFrame,
    largest: CursorFrame,
    hotspot: [u16; 2],
}

#[cfg(target_os = "windows")]
fn imports_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("cursor-imports"))
        .map_err(|error| format!("Import directory is unavailable: {error}"))
}

#[cfg(target_os = "windows")]
fn user_catalog_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("user-cursors.json"))
        .map_err(|error| format!("Import catalog is unavailable: {error}"))
}

#[cfg(target_os = "windows")]
pub fn load_user_catalog(app: &tauri::AppHandle) -> Result<LocalCatalog, String> {
    let path = user_catalog_path(app)?;
    if !path.exists() {
        return Ok(LocalCatalog { packs: Vec::new() });
    }
    let data = fs::read_to_string(path)
        .map_err(|error| format!("Could not read imported cursor catalog: {error}"))?;
    serde_json::from_str(&data).map_err(|error| format!("Invalid imported cursor catalog: {error}"))
}

#[cfg(target_os = "windows")]
pub fn imported_pack_root(app: &tauri::AppHandle, folder: &str) -> Result<PathBuf, String> {
    Ok(imports_root(app)?.join(folder))
}

#[cfg(target_os = "windows")]
fn read_text(path: &Path) -> Result<String, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    if bytes.starts_with(&[0xff, 0xfe]) {
        let words = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect::<Vec<_>>();
        return Ok(String::from_utf16_lossy(&words));
    }
    Ok(
        String::from_utf8_lossy(bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes))
            .into_owned(),
    )
}

#[cfg(target_os = "windows")]
fn strings_section(path: &Path) -> Result<HashMap<String, String>, String> {
    let mut values = HashMap::new();
    let mut section = String::new();
    for raw in read_text(path)?.lines() {
        let line = raw.trim();
        if line.starts_with('[') && line.ends_with(']') {
            section = line[1..line.len() - 1].to_ascii_lowercase();
        } else if section == "strings" && !line.starts_with(';') {
            if let Some((key, value)) = line.split_once('=') {
                values.insert(
                    key.trim().to_ascii_lowercase(),
                    value.trim().trim_matches('"').trim().to_string(),
                );
            }
        }
    }
    Ok(values)
}

#[cfg(target_os = "windows")]
fn find_infs(root: &Path) -> Result<Vec<PathBuf>, String> {
    fn visit(
        root: &Path,
        directory: &Path,
        seen: &mut HashSet<PathBuf>,
        out: &mut Vec<PathBuf>,
    ) -> Result<(), String> {
        let canonical = fs::canonicalize(directory)
            .map_err(|error| format!("Could not read {}: {error}", directory.display()))?;
        if !canonical.starts_with(root) || !seen.insert(canonical) {
            return Ok(());
        }
        for entry in fs::read_dir(directory)
            .map_err(|error| format!("Could not scan {}: {error}", directory.display()))?
        {
            let path = entry.map_err(|error| error.to_string())?.path();
            if path.is_dir() {
                visit(root, &path, seen, out)?;
            } else if path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("inf"))
            {
                out.push(path);
            }
        }
        Ok(())
    }

    let canonical = fs::canonicalize(root)
        .map_err(|error| format!("Selected folder is unavailable: {error}"))?;
    let mut infs = Vec::new();
    visit(&canonical, &canonical, &mut HashSet::new(), &mut infs)?;
    infs.sort();
    Ok(infs)
}

#[cfg(target_os = "windows")]
fn resolve_cursor(root: &Path, folder: &Path, value: &str) -> Option<PathBuf> {
    let relative = value.replace('\\', "/");
    let direct = folder.join(&relative);
    let candidate = if direct.is_file() {
        direct
    } else {
        let wanted = Path::new(&relative).file_name()?.to_string_lossy();
        fs::read_dir(folder)
            .ok()?
            .flatten()
            .map(|entry| entry.path())
            .find(|path| {
                path.is_file()
                    && path
                        .file_name()
                        .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case(&wanted))
            })?
    };
    let canonical = fs::canonicalize(candidate).ok()?;
    let extension = canonical.extension()?.to_string_lossy();
    (canonical.starts_with(root)
        && (extension.eq_ignore_ascii_case("cur") || extension.eq_ignore_ascii_case("ani")))
    .then_some(canonical)
}

#[cfg(target_os = "windows")]
fn slug(value: &str) -> String {
    let mut clean = String::new();
    let mut separator = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            clean.push(character);
            separator = false;
        } else if !separator && !clean.is_empty() {
            clean.push('-');
            separator = true;
        }
        if clean.len() >= 56 {
            break;
        }
    }
    let clean = clean.trim_matches('-');
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!(
        "{}-{:08x}",
        if clean.is_empty() { "imported" } else { clean },
        hasher.finish() as u32
    )
}

#[cfg(target_os = "windows")]
fn content_fingerprint(sources: &HashMap<String, PathBuf>) -> Result<String, String> {
    let mut entries = sources.iter().collect::<Vec<_>>();
    entries.sort_by(|left, right| left.0.cmp(right.0));
    let mut hasher = Sha256::new();
    for (role, source) in entries {
        hasher.update(role.as_bytes());
        hasher.update([0]);
        hasher.update(fs::read(source).map_err(|error| format!("Could not read {}: {error}", source.display()))?);
        hasher.update([0]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(target_os = "windows")]
fn scale_to_32(image: CursorFrame) -> CursorFrame {
    if image.width == 32 && image.height == 32 {
        return image;
    }
    let mut rgba = vec![0; 32 * 32 * 4];
    for y in 0..32usize {
        for x in 0..32usize {
            let source_x = x * image.width as usize / 32;
            let source_y = y * image.height as usize / 32;
            let source = (source_y * image.width as usize + source_x) * 4;
            rgba[(y * 32 + x) * 4..(y * 32 + x) * 4 + 4]
                .copy_from_slice(&image.rgba[source..source + 4]);
        }
    }
    CursorFrame {
        width: 32,
        height: 32,
        rgba,
    }
}

#[cfg(target_os = "windows")]
fn scale_hotspot(hotspot: [u16; 2], width: u32, height: u32) -> [u16; 2] {
    [
        ((hotspot[0] as u32 * 32 + width / 2) / width).min(31) as u16,
        ((hotspot[1] as u32 * 32 + height / 2) / height).min(31) as u16,
    ]
}

#[cfg(target_os = "windows")]
fn cursor_images(data: &[u8]) -> Result<Vec<CursorImages>, String> {
    let mut images = Vec::new();
    let mut offset = 0;
    while offset + 6 <= data.len() {
        let Some(relative) = data[offset..]
            .windows(4)
            .position(|bytes| bytes == [0, 0, 2, 0])
        else {
            break;
        };
        let start = offset + relative;
        if let Ok(directory) = ico::IconDir::read(Cursor::new(&data[start..])) {
            let entries = directory.entries();
            if !entries.is_empty() {
                let decode = |entry: &ico::IconDirEntry| -> Result<CursorFrame, String> {
                    let decoded = entry
                        .decode()
                        .map_err(|error| format!("Unsupported cursor image: {error}"))?;
                    Ok(CursorFrame {
                        width: decoded.width(),
                        height: decoded.height(),
                        rgba: decoded.rgba_data().to_vec(),
                    })
                };
                let decoded = entries
                    .iter()
                    .filter_map(|entry| decode(entry).ok().map(|image| (entry, image)))
                    .collect::<Vec<_>>();
                if !decoded.is_empty() {
                    let native_index = decoded
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, (entry, _))| {
                            entry.width().abs_diff(32) + entry.height().abs_diff(32)
                        })
                        .unwrap()
                        .0;
                    let largest_index = decoded
                        .iter()
                        .enumerate()
                        .max_by_key(|(_, (entry, _))| entry.width() * entry.height())
                        .unwrap()
                        .0;
                    let native_entry = decoded[native_index].0;
                    let hotspot = native_entry.cursor_hotspot().unwrap_or((0, 0));
                    images.push(CursorImages {
                        native: scale_to_32(decoded[native_index].1.clone()),
                        largest: decoded[largest_index].1.clone(),
                        hotspot: scale_hotspot(
                            [hotspot.0, hotspot.1],
                            native_entry.width(),
                            native_entry.height(),
                        ),
                    });
                }
            }
        }
        offset = start + 4;
    }
    if images.is_empty() {
        Err("No supported cursor frame found".into())
    } else {
        Ok(images)
    }
}

#[cfg(target_os = "windows")]
fn encode_png(
    width: u32,
    height: u32,
    frames: &[&[u8]],
    animated: bool,
) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut output, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        if animated && frames.len() > 1 {
            encoder
                .set_animated(frames.len() as u32, 0)
                .map_err(|error| error.to_string())?;
            encoder
                .set_frame_delay(5, 100)
                .map_err(|error| error.to_string())?;
        }
        let mut writer = encoder.write_header().map_err(|error| error.to_string())?;
        for frame in frames {
            writer
                .write_image_data(frame)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(output)
}

#[cfg(target_os = "windows")]
fn data_url(bytes: Vec<u8>) -> String {
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

#[cfg(target_os = "windows")]
fn build_assets(path: &Path) -> Result<(String, String, [u16; 2]), String> {
    let data =
        fs::read(path).map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    let frames = cursor_images(&data)?;
    let largest = &frames[0].largest;
    let mut min_x = largest.width;
    let mut min_y = largest.height;
    let mut max_x = 0;
    let mut max_y = 0;
    for y in 0..largest.height {
        for x in 0..largest.width {
            if largest.rgba[((y * largest.width + x) * 4 + 3) as usize] >= 8 {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x + 1);
                max_y = max_y.max(y + 1);
            }
        }
    }
    let (min_x, min_y, max_x, max_y) = if min_x < max_x && min_y < max_y {
        (min_x, min_y, max_x, max_y)
    } else {
        (0, 0, largest.width, largest.height)
    };
    let crop_width = max_x - min_x;
    let crop_height = max_y - min_y;
    let side = crop_width.max(crop_height) + 8;
    let mut card = vec![0; (side * side * 4) as usize];
    let left = (side - crop_width) / 2;
    let top = (side - crop_height) / 2;
    for y in 0..crop_height {
        for x in 0..crop_width {
            let source = (((min_y + y) * largest.width + min_x + x) * 4) as usize;
            let target = (((top + y) * side + left + x) * 4) as usize;
            card[target..target + 4].copy_from_slice(&largest.rgba[source..source + 4]);
        }
    }
    let preview = data_url(encode_png(side, side, &[&card], false)?);
    let native = frames
        .iter()
        .map(|frame| frame.native.rgba.as_slice())
        .collect::<Vec<_>>();
    let hover = data_url(encode_png(
        32,
        32,
        &native,
        path.extension()
            .is_some_and(|value| value.eq_ignore_ascii_case("ani")),
    )?);
    Ok((preview, hover, frames[0].hotspot))
}

#[cfg(target_os = "windows")]
fn save_catalog(app: &tauri::AppHandle, catalog: &LocalCatalog) -> Result<(), String> {
    let path = user_catalog_path(app)?;
    let parent = path.parent().ok_or("Import catalog path has no parent")?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create import directory: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let data = serde_json::to_vec_pretty(catalog).map_err(|error| error.to_string())?;
    fs::write(&temporary, data)
        .map_err(|error| format!("Could not save import catalog: {error}"))?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Could not replace import catalog: {error}"))?;
    }
    fs::rename(temporary, path).map_err(|error| format!("Could not finish import catalog: {error}"))
}

#[cfg(target_os = "windows")]
fn valid_remote_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 128
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
}

#[cfg(target_os = "windows")]
fn valid_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

#[cfg(target_os = "windows")]
pub fn install_remote_package(
    app: &tauri::AppHandle,
    pack_id: &str,
    package: &[u8],
    expected_bytes: usize,
    package_sha256: &str,
    manifest_hash: &str,
    fingerprint: &str,
) -> Result<(), String> {
    if !valid_remote_id(pack_id)
        || package.is_empty()
        || package.len() != expected_bytes
        || package.len() > MAX_REMOTE_PACKAGE_BYTES
        || !valid_sha256(package_sha256)
        || !valid_sha256(manifest_hash)
        || !valid_sha256(fingerprint)
    {
        return Err("Remote cursor package metadata is invalid".into());
    }
    if format!("{:x}", Sha256::digest(package)) != package_sha256 {
        return Err("Package checksum does not match".into());
    }

    let mut archive = zip::ZipArchive::new(Cursor::new(package))
        .map_err(|error| format!("Invalid cursor package: {error}"))?;
    if archive.len() > ROLE_REGISTRY.len() + 1 {
        return Err("Cursor package contains too many files".into());
    }
    let manifest_data = {
        let file = archive
            .by_name("manifest.json")
            .map_err(|_| "Cursor package manifest is missing".to_string())?;
        let mut data = Vec::new();
        file.take(64 * 1024 + 1)
            .read_to_end(&mut data)
            .map_err(|error| format!("Could not read cursor package manifest: {error}"))?;
        if data.len() > 64 * 1024 {
            return Err("Cursor package manifest is too large".into());
        }
        data
    };
    let manifest: RemoteManifest = serde_json::from_slice(&manifest_data)
        .map_err(|error| format!("Invalid cursor package manifest: {error}"))?;
    if manifest.schema != 1
        || manifest.id != pack_id
        || manifest.manifest_hash != manifest_hash
        || manifest.version != manifest_hash
        || manifest.fingerprint != fingerprint
    {
        return Err("Cursor package manifest does not match the catalog".into());
    }

    let known_roles = ROLE_REGISTRY
        .iter()
        .map(|(role, _)| *role)
        .collect::<HashSet<_>>();
    for (index, (role, _)) in ROLE_REGISTRY.iter().enumerate() {
        if index < 15 && !manifest.roles.contains_key(*role) {
            return Err(format!("Cursor package is missing required role: {role}"));
        }
    }
    let mut expected_names = HashSet::from(["manifest.json".to_string()]);
    for (role, entry) in &manifest.roles {
        let extension = Path::new(&entry.file)
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .ok_or_else(|| format!("Cursor role has no file type: {role}"))?;
        let expected_file = format!("roles/{role}.{extension}");
        if !known_roles.contains(role.as_str())
            || !matches!(extension.as_str(), "cur" | "ani")
            || entry.file != expected_file
            || !valid_sha256(&entry.sha256)
            || !expected_names.insert(entry.file.clone())
        {
            return Err(format!("Cursor package has an invalid role: {role}"));
        }
    }

    let mut archive_names = HashSet::new();
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("Could not inspect cursor package: {error}"))?;
        let name = file
            .enclosed_name()
            .ok_or_else(|| "Cursor package contains an unsafe path".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if !file.is_file() || !expected_names.contains(&name) || !archive_names.insert(name) {
            return Err("Cursor package contains an unexpected file".into());
        }
        if file.size() > MAX_REMOTE_FILE_BYTES as u64 && file.name() != "manifest.json" {
            return Err("Cursor package contains an oversized file".into());
        }
    }
    if archive_names != expected_names {
        return Err("Cursor package is incomplete".into());
    }

    let import_root = imports_root(app)?;
    fs::create_dir_all(&import_root)
        .map_err(|error| format!("Could not create cursor library: {error}"))?;
    let staging = import_root.join(format!(".{pack_id}-downloading"));
    let destination = import_root.join(pack_id);
    if staging.exists() {
        fs::remove_dir_all(&staging)
            .map_err(|error| format!("Could not reset cursor download: {error}"))?;
    }
    fs::create_dir(&staging)
        .map_err(|error| format!("Could not stage cursor download: {error}"))?;

    let result = (|| -> Result<(), String> {
        let mut sources = HashMap::new();
        let mut roles = HashMap::new();
        for (role, entry) in &manifest.roles {
            let mut file = archive
                .by_name(&entry.file)
                .map_err(|_| format!("Cursor package is missing {}", entry.file))?;
            let mut bytes = Vec::new();
            file.by_ref()
                .take(MAX_REMOTE_FILE_BYTES as u64 + 1)
                .read_to_end(&mut bytes)
                .map_err(|error| format!("Could not read {}: {error}", entry.file))?;
            if bytes.len() > MAX_REMOTE_FILE_BYTES
                || format!("{:x}", Sha256::digest(&bytes)) != entry.sha256
            {
                return Err(format!("Cursor role checksum does not match: {role}"));
            }
            let extension = Path::new(&entry.file)
                .extension()
                .and_then(|value| value.to_str())
                .ok_or_else(|| format!("Cursor role has no file type: {role}"))?;
            let name = format!("{role}.{extension}");
            let path = staging.join(&name);
            fs::write(&path, bytes)
                .map_err(|error| format!("Could not save cursor role {role}: {error}"))?;
            let (preview, hover, hotspot) = build_assets(&path)?;
            sources.insert(role.clone(), path);
            roles.insert(
                role.clone(),
                LocalRole {
                    file: name,
                    preview,
                    hover,
                    hotspot,
                },
            );
        }
        if content_fingerprint(&sources)? != fingerprint {
            return Err("Cursor package fingerprint does not match".into());
        }
        let preview = roles
            .get("arrow")
            .ok_or("Cursor package has no arrow")?
            .preview
            .clone();
        let mut catalog = load_user_catalog(app)?;
        let pack = LocalPack {
            id: pack_id.to_string(),
            name: manifest.name,
            folder: pack_id.to_string(),
            author: manifest.author,
            author_url: manifest.author_url,
            license: manifest.license.filter(|value| !value.is_empty()),
            fingerprint: manifest.fingerprint,
            preview,
            roles,
            user: true,
        };
        if destination.exists() {
            fs::remove_dir_all(&destination)
                .map_err(|error| format!("Could not replace downloaded cursor pack: {error}"))?;
        }
        fs::rename(&staging, &destination)
            .map_err(|error| format!("Could not finish cursor download: {error}"))?;
        catalog.packs.retain(|existing| existing.id != pack.id);
        catalog.packs.push(pack);
        catalog.packs.sort_by(|left, right| {
            left.name
                .to_ascii_lowercase()
                .cmp(&right.name.to_ascii_lowercase())
        });
        save_catalog(app, &catalog)
    })();
    if result.is_err() && staging.exists() {
        let _ = fs::remove_dir_all(staging);
    }
    result
}

#[cfg(target_os = "windows")]
pub fn import_folder(app: &tauri::AppHandle, source: &Path) -> Result<usize, String> {
    let root = fs::canonicalize(source)
        .map_err(|error| format!("Selected folder is unavailable: {error}"))?;
    if !root.is_dir() {
        return Err("Select a folder containing an Install.inf cursor scheme".into());
    }
    let infs = find_infs(&root)?;
    if infs.is_empty() {
        return Err("No .inf cursor scheme found in the selected folder".into());
    }

    let mut catalog = load_user_catalog(app)?;
    let mut accepted = 0;
    let mut first_error = None;
    for inf in infs {
        let result = (|| -> Result<LocalPack, String> {
            let values = strings_section(&inf)?;
            let mut sources = HashMap::new();
            for (index, (role, aliases)) in ROLE_ALIASES.iter().enumerate() {
                let value = aliases.iter().find_map(|key| values.get(*key));
                match value
                    .and_then(|value| resolve_cursor(&root, inf.parent().unwrap_or(&root), value))
                {
                    Some(path) => {
                        sources.insert((*role).to_string(), path);
                    }
                    None if index < 15 => {
                        return Err(format!("{} is missing {role}", inf.display()))
                    }
                    None => {}
                }
            }
            let name = values
                .get("scheme_name")
                .cloned()
                .or_else(|| inf.parent()?.file_name()?.to_str().map(str::to_string))
                .unwrap_or_else(|| "Imported cursor pack".into());
            let id = slug(&format!("{}:{}", root.display(), name));
            let fingerprint = content_fingerprint(&sources)?;
            let import_root = imports_root(app)?;
            fs::create_dir_all(&import_root)
                .map_err(|error| format!("Could not create import directory: {error}"))?;
            let destination = import_root.join(&id);
            let staging = import_root.join(format!(".{id}-importing"));
            if staging.exists() {
                fs::remove_dir_all(&staging)
                    .map_err(|error| format!("Could not reset import staging: {error}"))?;
            }
            fs::create_dir(&staging)
                .map_err(|error| format!("Could not create imported pack: {error}"))?;
            let mut roles = HashMap::new();
            for (role, source) in sources {
                let extension = source
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("cur")
                    .to_ascii_lowercase();
                let file = format!("{role}.{extension}");
                fs::copy(&source, staging.join(&file))
                    .map_err(|error| format!("Could not copy {}: {error}", source.display()))?;
                let (preview, hover, hotspot) = build_assets(&source)?;
                roles.insert(
                    role,
                    LocalRole {
                        file,
                        preview,
                        hover,
                        hotspot,
                    },
                );
            }
            let preview = roles
                .get("arrow")
                .ok_or("Imported pack has no arrow")?
                .preview
                .clone();
            if destination.exists() {
                fs::remove_dir_all(&destination)
                    .map_err(|error| format!("Could not replace imported pack: {error}"))?;
            }
            fs::rename(&staging, &destination)
                .map_err(|error| format!("Could not finish imported pack: {error}"))?;
            Ok(LocalPack {
                id: id.clone(),
                name,
                folder: id,
                author: "Imported".into(),
                author_url: String::new(),
                license: None,
                fingerprint,
                preview,
                roles,
                user: true,
            })
        })();
        match result {
            Ok(pack) => {
                catalog.packs.retain(|existing| existing.id != pack.id);
                catalog.packs.push(pack);
                accepted += 1;
            }
            Err(error) => {
                first_error.get_or_insert(error);
            }
        };
    }
    if accepted == 0 {
        return Err(first_error.unwrap_or_else(|| "No valid cursor scheme found".into()));
    }
    catalog.packs.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
    });
    save_catalog(app, &catalog)?;
    Ok(accepted)
}

#[cfg(not(target_os = "windows"))]
pub fn unsupported() -> Result<(), String> {
    Err("Cursor folder import is supported on Windows only".into())
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::cursor_images;
    use std::{fs, path::Path};

    #[test]
    fn published_cursor_frames_decode() {
        fn visit(folder: &Path, cursors: &mut Vec<std::path::PathBuf>) {
            for entry in fs::read_dir(folder).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    visit(&path, cursors);
                } else if path.extension().is_some_and(|value| {
                    value.eq_ignore_ascii_case("cur") || value.eq_ignore_ascii_case("ani")
                }) {
                    cursors.push(path);
                }
            }
        }

        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../cursors");
        let mut cursors = Vec::new();
        visit(&root, &mut cursors);
        assert!(cursors.len() > 3_000);
        for path in cursors {
            let data = fs::read(&path).unwrap();
            let result = cursor_images(&data);
            assert!(
                result.is_ok(),
                "native preview decoder rejected {}: {:?}; directory: {:?}",
                path.display(),
                result.err(),
                ico::IconDir::read(std::io::Cursor::new(&data)).err()
            );
        }
    }
}
