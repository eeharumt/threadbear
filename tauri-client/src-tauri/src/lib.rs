use tauri::{utils::config::FrontendDist, webview::PageLoadEvent, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_page_load(|webview, page| {
            let Some(FrontendDist::Url(site)) = &webview.config().build.frontend_dist else {
                return;
            };
            if page.event() == PageLoadEvent::Finished && page.url().origin() == site.origin() {
                let script = format!(
                    "({})({:?}, {})",
                    include_str!("sign-in.js"),
                    site.origin().ascii_serialization(),
                    cfg!(target_os = "android"),
                );
                let _ = webview.eval(script);
            }
        })
        .run(tauri::generate_context!())
        .expect("could not start Threadbear");
}
