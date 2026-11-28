// What GPUI can't do for a torn-out window: move it by hand and fade it. The
// Swift dock does both with AppKit (setFrameOrigin, alphaValue) so a window
// follows the pointer back over the dock with the drop targets showing through.
//
// On the Mac this is a little objc2 against the window's own NSWindow. On
// Windows and X11 moving by hand isn't written yet, so
// `can_move_windows_by_hand` is false there and dragging a panel's window
// title moves it with the OS's own window drag, without targets. GPUI's
// Windows `start_window_move` does nothing, so that drag is
// [`start_window_move`] below. On Wayland moving by hand can never work: apps aren't told where
// the pointer is outside their own windows and can't place their own windows,
// so the compass's Window button and the Put Back menu command are the way
// there (the task's plan for it: docs/gpui-port.md, "BearDock").
#[cfg(not(target_os = "macos"))]
use gpui_kit::*;

pub fn can_move_windows_by_hand() -> bool {
    cfg!(target_os = "macos")
}

static SCRIPTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// For the demo's scripted events: pointer positions come from the script's
/// events, not the real mouse (which is somewhere else entirely).
pub fn set_scripted_pointer(on: bool) {
    SCRIPTED.store(on, std::sync::atomic::Ordering::Relaxed);
}

fn pointer_is_scripted() -> bool {
    SCRIPTED.load(std::sync::atomic::Ordering::Relaxed)
}

/// Where a window and the pointer were when a press began, in the OS's own
/// screen coordinates, for moving the window with the pointer from then on.
///
/// Why by hand: a bar can't start the OS's window drag on the press, as the
/// press might be a click or a held panel drag, and by the time the pointer
/// has moved AppKit won't start one (`performWindowDragWithEvent:` wants the
/// mouse-down and does nothing with a later event). Swift's dock moves the
/// window itself for the same reason (DockView's `.window` mode).
#[derive(Clone, Copy)]
pub struct WindowGrab {
    #[cfg(target_os = "macos")]
    origin: (f64, f64),
    #[cfg(target_os = "macos")]
    mouse: (f64, f64),
}

#[cfg(target_os = "macos")]
mod mac {
    use gpui_kit::{Pixels, Window};
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use raw_window_handle::RawWindowHandle;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSPoint {
        x: f64,
        y: f64,
    }

    // SAFETY: NSPoint is repr(C) with two f64 fields, the same layout as
    // CGPoint on 64-bit macOS, which is what this encoding says.
    unsafe impl objc2::Encode for NSPoint {
        const ENCODING: objc2::Encoding =
            objc2::Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSSize {
        width: f64,
        height: f64,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSRect {
        origin: NSPoint,
        size: NSSize,
    }

    // SAFETY: NSSize is repr(C) with two f64 fields, the same layout as
    // CGSize on 64-bit macOS, which is what this encoding says.
    unsafe impl objc2::Encode for NSSize {
        const ENCODING: objc2::Encoding =
            objc2::Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
    }

    // SAFETY: NSRect is repr(C) as an NSPoint then an NSSize, the same layout
    // as CGRect, and the encoding is built from theirs.
    unsafe impl objc2::Encode for NSRect {
        const ENCODING: objc2::Encoding =
            objc2::Encoding::Struct("CGRect", &[NSPoint::ENCODING, NSSize::ENCODING]);
    }

    fn ns_window(window: &Window) -> Option<*mut AnyObject> {
        let handle = <Window as raw_window_handle::HasWindowHandle>::window_handle(window).ok()?;
        let RawWindowHandle::AppKit(handle) = handle.as_raw() else {
            return None;
        };
        let view = handle.ns_view.as_ptr() as *mut AnyObject;
        // SAFETY: GPUI hands us its live content view on this (main) thread.
        let window: *mut AnyObject = unsafe { msg_send![view, window] };
        (!window.is_null()).then_some(window)
    }

    /// `origin` in GPUI's window coordinates: top-left on the main display.
    pub fn set_window_origin(window: &Window, origin: gpui_kit::Point<Pixels>) {
        let Some(ns) = ns_window(window) else { return };
        // SAFETY: `ns` is the live NSWindow behind GPUI's `window`, which the
        // borrow keeps open, and GPUI calls us on the main thread as AppKit
        // needs. screen, frame and setFrameOrigin:
        // are NSWindow/NSScreen methods with the types used here, and a nil
        // screen returns early.
        unsafe {
            let screen: *mut AnyObject = msg_send![ns, screen];
            if screen.is_null() {
                return;
            }
            // GPUI's bounds() flips about this window's screen; do the same
            // so a frame read from it comes back to the same place.
            let screen_frame: NSRect = msg_send![screen, frame];
            let frame: NSRect = msg_send![ns, frame];
            // GPUI: x is relative to the screen's origin; y from its top.
            let x = screen_frame.origin.x + origin.x.as_f32() as f64;
            let bottom_y = screen_frame.origin.y + screen_frame.size.height
                - origin.y.as_f32() as f64
                - frame.size.height;
            let _: () = msg_send![ns, setFrameOrigin: NSPoint { x, y: bottom_y }];
        }
    }

    pub fn set_window_alpha(window: &Window, alpha: f64) {
        let Some(ns) = ns_window(window) else { return };
        // SAFETY: `ns` is the live NSWindow behind GPUI's `window`, which the
        // borrow keeps open, and GPUI calls us on the main thread as AppKit
        // needs. setAlphaValue: takes a CGFloat (f64).
        unsafe {
            let _: () = msg_send![ns, setAlphaValue: alpha];
        }
    }

    /// Where the pointer is relative to the window's corner, in the window's
    /// points, read fresh from AppKit. Events carry the same thing, but one
    /// already in the queue was computed against where the window was before
    /// we moved it, which shakes a window that's following the pointer; the
    /// Swift dock reads NSEvent.mouseLocation for the same reason.
    pub fn pointer_in_window(window: &Window) -> Option<gpui_kit::Point<Pixels>> {
        use gpui_kit::{point, px};
        if super::pointer_is_scripted() {
            return None;
        }
        let ns = ns_window(window)?;
        // SAFETY: `ns` is the live NSWindow behind GPUI's `window`, which the
        // borrow keeps open, and GPUI calls us on the main thread as AppKit
        // needs. +[NSEvent mouseLocation] and -frame
        // return the NSPoint and NSRect read here.
        unsafe {
            let location: NSPoint = msg_send![objc2::class!(NSEvent), mouseLocation];
            let frame: NSRect = msg_send![ns, frame];
            Some(point(
                px((location.x - frame.origin.x) as f32),
                px((frame.origin.y + frame.size.height - location.y) as f32),
            ))
        }
    }

    /// In AppKit's global coordinates, not GPUI's: those are relative to the
    /// window's current display, so they'd jump as it crossed to another.
    pub fn grab_window(window: &Window) -> Option<super::WindowGrab> {
        if super::pointer_is_scripted() {
            return None;
        }
        let ns = ns_window(window)?;
        // SAFETY: `ns` is the live NSWindow behind GPUI's `window`, which the
        // borrow keeps open, and GPUI calls us on the main thread as AppKit
        // needs. +[NSEvent mouseLocation] and -frame
        // return the NSPoint and NSRect read here.
        unsafe {
            let mouse: NSPoint = msg_send![objc2::class!(NSEvent), mouseLocation];
            let frame: NSRect = msg_send![ns, frame];
            Some(super::WindowGrab {
                origin: (frame.origin.x, frame.origin.y),
                mouse: (mouse.x, mouse.y),
            })
        }
    }

    pub fn move_grabbed_window(window: &Window, grab: super::WindowGrab) {
        let Some(ns) = ns_window(window) else { return };
        // SAFETY: `ns` is the live NSWindow behind GPUI's `window`, which the
        // borrow keeps open, and GPUI calls us on the main thread as AppKit
        // needs. +[NSEvent mouseLocation] returns an
        // NSPoint and setFrameOrigin: takes one.
        unsafe {
            let mouse: NSPoint = msg_send![objc2::class!(NSEvent), mouseLocation];
            let origin = NSPoint {
                x: grab.origin.0 + mouse.x - grab.mouse.0,
                y: grab.origin.1 + mouse.y - grab.mouse.1,
            };
            let _: () = msg_send![ns, setFrameOrigin: origin];
        }
    }

    /// Clicks go through the window to whatever is under it: the outline of a
    /// window about to open, which mustn't catch the pointer it follows.
    pub fn set_ignores_mouse_events(window: &Window, ignores: bool) {
        let Some(ns) = ns_window(window) else { return };
        // SAFETY: `ns` is the live NSWindow behind GPUI's `window`, which the
        // borrow keeps open, and GPUI calls us on the main thread as AppKit
        // needs. setIgnoresMouseEvents: takes a BOOL.
        unsafe {
            let _: () = msg_send![ns, setIgnoresMouseEvents: ignores];
        }
    }
}

#[cfg(target_os = "macos")]
pub use mac::{
    grab_window, move_grabbed_window, pointer_in_window, set_ignores_mouse_events,
    set_window_alpha, set_window_origin,
};

/// Everywhere else, the event's own position is the best there is.
#[cfg(not(target_os = "macos"))]
pub fn pointer_in_window(_window: &Window) -> Option<Point<Pixels>> {
    let _ = pointer_is_scripted();
    None
}

/// None here means the caller hands the move to the OS ([`start_window_move`]),
/// which on Windows and X11 is happy to start from a pointer move.
#[cfg(not(target_os = "macos"))]
pub fn grab_window(_window: &Window) -> Option<WindowGrab> {
    None
}
#[cfg(not(target_os = "macos"))]
pub fn move_grabbed_window(_window: &Window, _grab: WindowGrab) {}
#[cfg(not(target_os = "macos"))]
pub fn set_window_origin(_window: &Window, _origin: Point<Pixels>) {}
#[cfg(not(target_os = "macos"))]
pub fn set_window_alpha(_window: &Window, _alpha: f64) {}
#[cfg(not(target_os = "macos"))]
pub fn set_ignores_mouse_events(_window: &Window, _ignores: bool) {}

/// Starts the operating system's window drag.
///
/// On the Mac this is AppKit's own. On Windows GPUI's `Window::start_window_move`
/// is a no-op, so a press on a panel bar never moved the window. The system
/// caption drag does, and it still starts after the pointer has moved: the
/// dock waits until a press has turned out not to be a panel drag.
pub fn start_window_move(window: &gpui_kit::Window) {
    #[cfg(target_os = "windows")]
    if windows::drag_by_caption(window) {
        return;
    }
    window.start_window_move();
}

/// Draws a system title bar on a window that was opened with
/// `appears_transparent: false`.
///
/// GPUI creates a normal Windows window without `WS_CAPTION`, so asking for a
/// title bar does not draw one and there is nothing to drag. No effect on
/// other platforms. A window opened with a transparent title bar covers any
/// caption in its client area, so this does not put a bar on those.
pub fn install_system_title_bar(window: &gpui_kit::Window) {
    #[cfg(target_os = "windows")]
    windows::add_caption(window);
    #[cfg(not(target_os = "windows"))]
    let _ = window;
}

#[cfg(windows)]
pub fn request_system_close(window: &gpui_kit::Window) {
    windows::request_close(window);
}

#[cfg(target_os = "windows")]
mod windows {
    use raw_window_handle::RawWindowHandle;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT, WPARAM};
    use windows::Win32::UI::Input::KeyboardAndMouse::ReleaseCapture;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClientRect, GetWindowLongPtrW, GetWindowRect, IsZoomed, PostMessageW, SendMessageW,
        SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_STYLE, HTCAPTION, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_MAXIMIZE, WINDOW_STYLE, WM_CLOSE,
        WM_NCLBUTTONDOWN, WS_CAPTION,
    };

    fn hwnd(window: &gpui_kit::Window) -> Option<HWND> {
        // `Window::window_handle` is GPUI's own id. The raw handle is the trait's.
        let handle =
            <gpui_kit::Window as raw_window_handle::HasWindowHandle>::window_handle(window).ok()?;
        let RawWindowHandle::Win32(handle) = handle.as_raw() else {
            return None;
        };
        let hwnd = HWND(handle.hwnd.get() as *mut core::ffi::c_void);
        (!hwnd.is_invalid()).then_some(hwnd)
    }

    /// `true` when the system drag was asked for. A missing handle falls
    /// through to GPUI, which on Windows still does nothing.
    pub(super) fn drag_by_caption(window: &gpui_kit::Window) -> bool {
        let Some(hwnd) = hwnd(window) else {
            return false;
        };
        // SAFETY: `hwnd` is the live window behind this GPUI window, and GPUI
        // calls us on the thread that owns it. ReleaseCapture drops the
        // capture taken on the press, so the caption drag can begin.
        // SendMessage runs that drag and returns when the button comes up.
        unsafe {
            let _ = ReleaseCapture();
            let _ = SendMessageW(
                hwnd,
                WM_NCLBUTTONDOWN,
                Some(WPARAM(HTCAPTION as usize)),
                Some(LPARAM(0)),
            );
        }
        true
    }

    pub(super) fn request_close(window: &gpui_kit::Window) {
        if let Some(hwnd) = hwnd(window) {
            // SAFETY: this is the live window. Posting lets GPUI handle the
            // close after the action's current update has finished.
            let _ = unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) };
        }
    }

    pub(super) fn add_caption(window: &gpui_kit::Window) {
        let Some(hwnd) = hwnd(window) else {
            return;
        };
        // SAFETY: `hwnd` is the live window behind this GPUI window, on its
        // own thread. The style word is the window's, and the rects are only
        // read for the call. The extra height is the caption just added, so
        // the client area stays the size GPUI was given; a maximized window
        // is put back maximized instead, because growing it would restore it.
        unsafe {
            let style = WINDOW_STYLE(GetWindowLongPtrW(hwnd, GWL_STYLE) as u32);
            if style.contains(WS_CAPTION) {
                return;
            }
            let zoomed = IsZoomed(hwnd).as_bool();
            let before = frame_extra(hwnd);
            SetWindowLongPtrW(hwnd, GWL_STYLE, (style | WS_CAPTION).0 as isize);
            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
            if zoomed {
                let _ = ShowWindow(hwnd, SW_MAXIMIZE);
                return;
            }
            let Some(before) = before else {
                return;
            };
            let Some(after) = frame_extra(hwnd) else {
                return;
            };
            let grow = after - before;
            if grow <= 0 {
                return;
            }
            let Some(rect) = window_rect(hwnd) else {
                return;
            };
            let _ = SetWindowPos(
                hwnd,
                None,
                rect.left,
                rect.top,
                rect.right - rect.left,
                rect.bottom - rect.top + grow,
                SWP_NOZORDER | SWP_NOACTIVATE,
            );
        }
    }

    /// How much taller the window is than its client area.
    ///
    /// # Safety
    ///
    /// `hwnd` is a live window on this thread.
    unsafe fn frame_extra(hwnd: HWND) -> Option<i32> {
        // SAFETY: the caller holds a live window on this thread.
        let rect = unsafe { window_rect(hwnd) }?;
        let mut client = RECT::default();
        // SAFETY: the caller holds a live window on this thread, and `client`
        // lasts for the call.
        unsafe { GetClientRect(hwnd, &mut client) }.ok()?;
        Some((rect.bottom - rect.top) - (client.bottom - client.top))
    }

    /// # Safety
    ///
    /// `hwnd` is a live window on this thread.
    unsafe fn window_rect(hwnd: HWND) -> Option<RECT> {
        let mut rect = RECT::default();
        // SAFETY: the caller holds a live window on this thread, and `rect`
        // lasts for the call.
        unsafe { GetWindowRect(hwnd, &mut rect) }.ok()?;
        Some(rect)
    }
}
