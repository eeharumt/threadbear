use tauri::{
    menu::{Menu, SubmenuBuilder},
    AppHandle, Manager, Wry,
};

const ZOOM_LEVELS: [(&str, &str, f64); 6] = [
    ("zoom-80", "80%", 0.8),
    ("zoom-90", "90%", 0.9),
    ("zoom-100", "100% (Actual size)", 1.0),
    ("zoom-110", "110%", 1.1),
    ("zoom-125", "125%", 1.25),
    ("zoom-150", "150%", 1.5),
];

pub fn build(app: &AppHandle<Wry>) -> tauri::Result<Menu<Wry>> {
    let mut view = SubmenuBuilder::new(app, "&View");
    for (id, label, _) in ZOOM_LEVELS {
        view = view.text(id, label);
    }
    Menu::with_items(app, &[&view.build()?])
}

pub fn handle_event(app: &AppHandle<Wry>, event: tauri::menu::MenuEvent) {
    let Some((_, _, scale)) = ZOOM_LEVELS.iter().find(|(id, _, _)| event.id() == *id) else {
        return;
    };
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.set_zoom(*scale) {
            eprintln!("Could not set Threadbear zoom: {error}");
        }
    }
}
