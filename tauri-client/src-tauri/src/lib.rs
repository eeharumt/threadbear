use tauri::ipc::{InvokeBody, Request};

#[cfg(windows)]
mod view_menu;

/// The most a photo can be (convex/phone.ts, PHONE_UPLOADS.maxBytes).
const MAX_PHOTO_BYTES: usize = 10 * 1024 * 1024;

/// Posts a photo to the backend's one-use upload address
/// (phone:imageUploadUrl) and gives back its answer, `{"storageId": …}`.
/// The page can't: that address sends no CORS headers, as only the native
/// apps post to it. Only over https, and only to /phone/upload.
#[tauri::command]
async fn upload_photo(request: Request<'_>) -> Result<String, String> {
    let url = request
        .headers()
        .get("x-upload-url")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| tauri::Url::parse(v).ok())
        .filter(|u| u.scheme() == "https" && u.path() == "/phone/upload" && u.username().is_empty() && u.password().is_none())
        .ok_or("not an upload address")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("no photo".into());
    };
    if bytes.len() > MAX_PHOTO_BYTES {
        return Err("too big".into());
    }
    let response = reqwest::Client::new()
        .post(url.as_str())
        .header("content-type", "image/jpeg")
        .body(bytes.clone())
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let ok = response.status().is_success();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if ok {
        Ok(text)
    } else {
        Err(text)
    }
}

/// Opens Windows voice typing (Win+H) on what has the keyboard: the page
/// focuses its field first, and the words land there as if typed.
#[cfg(windows)]
#[tauri::command]
fn voice_typing() -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_LWIN};
    let key = |vk: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 } },
    };
    let h = b'H' as VIRTUAL_KEY;
    let keys = [key(VK_LWIN, false), key(h, false), key(h, true), key(VK_LWIN, true)];
    // SAFETY: `keys` is a live array of `keys.len()` INPUTs of the size given.
    let sent = unsafe { SendInput(keys.len() as u32, keys.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == keys.len() {
        Ok(())
    } else {
        Err("couldn't open voice typing".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    #[cfg(windows)]
    let builder = builder
        .menu(view_menu::build)
        .on_menu_event(view_menu::handle_event)
        .invoke_handler(tauri::generate_handler![upload_photo, voice_typing]);
    #[cfg(not(windows))]
    let builder = builder.invoke_handler(tauri::generate_handler![upload_photo]);
    builder.run(tauri::generate_context!()).expect("could not start Threadbear");
}
