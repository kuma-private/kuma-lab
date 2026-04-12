// build.rs — decides whether to compile the vst3 shim in stub mode
// (no SDK) or real mode (links VST3 SDK sources). The trigger is the
// environment variable `VST3_SDK_PATH`, which when present must point
// at a Steinberg vst3sdk checkout.

use std::env;
use std::path::PathBuf;

fn main() {
    // Advertise the custom cfg so rustc doesn't warn on `#[cfg(vst3_sdk_vendored)]`.
    println!("cargo::rustc-check-cfg=cfg(vst3_sdk_vendored)");
    println!("cargo:rerun-if-env-changed=VST3_SDK_PATH");
    println!("cargo:rerun-if-changed=cpp/vst3_shim.cpp");
    println!("cargo:rerun-if-changed=cpp/vst3_shim.h");

    let sdk_path = env::var("VST3_SDK_PATH").ok();

    let mut build = cc::Build::new();
    build.cpp(true).std("c++17").file("cpp/vst3_shim.cpp");

    match sdk_path {
        Some(path) if !path.is_empty() => {
            let sdk = PathBuf::from(&path);
            if !sdk.join("pluginterfaces").exists() {
                panic!(
                    "VST3_SDK_PATH={} does not contain a vst3sdk checkout \
                     (expected `pluginterfaces/` subdirectory). Either clear \
                     the variable to build the stub, or point it at a valid \
                     vst3sdk clone.",
                    path
                );
            }

            build
                .define("HAS_VST3_SDK", None)
                .define("RELEASE", None)
                .include(&sdk)
                .include(sdk.join("pluginterfaces"))
                .include(sdk.join("public.sdk/source"));

            // Minimal set of SDK sources the hosting flow in vst3_shim.cpp
            // depends on. The real SDK has more, but this matches the
            // subset Steinberg's own `hostclasses` example links.
            //
            // We intentionally keep the list short; when Phase 9 wires up
            // the parameter path / edit controller / IPlugView, more
            // sources will need to be added here.
            let extra_sources: &[&str] = &[
                "public.sdk/source/vst/hosting/hostclasses.cpp",
                "public.sdk/source/vst/hosting/module.cpp",
                "public.sdk/source/vst/hosting/plugprovider.cpp",
                "public.sdk/source/vst/hosting/pluginterfacesupport.cpp",
                "public.sdk/source/common/memorystream.cpp",
                "base/source/fstring.cpp",
                "base/source/fbuffer.cpp",
                "base/source/fdebug.cpp",
                "base/source/fobject.cpp",
                "base/source/baseiids.cpp",
                "base/source/updatehandler.cpp",
                "pluginterfaces/base/funknown.cpp",
                "pluginterfaces/base/coreiids.cpp",
            ];
            for s in extra_sources {
                let full = sdk.join(s);
                if full.exists() {
                    build.file(full);
                }
            }

            #[cfg(target_os = "macos")]
            {
                let mac_src = sdk.join("public.sdk/source/vst/hosting/module_mac.mm");
                if mac_src.exists() {
                    build.file(mac_src);
                }
                println!("cargo:rustc-link-lib=framework=CoreFoundation");
                println!("cargo:rustc-link-lib=framework=Cocoa");
            }
            #[cfg(target_os = "linux")]
            {
                let lin_src = sdk.join("public.sdk/source/vst/hosting/module_linux.cpp");
                if lin_src.exists() {
                    build.file(lin_src);
                }
                println!("cargo:rustc-link-lib=dylib=dl");
            }
            #[cfg(target_os = "windows")]
            {
                let win_src = sdk.join("public.sdk/source/vst/hosting/module_win32.cpp");
                if win_src.exists() {
                    build.file(win_src);
                }
            }

            println!("cargo:rustc-cfg=vst3_sdk_vendored");
            build.compile("vst3shim");
        }
        _ => {
            // Stub mode — no SDK includes, no extra sources.
            build.compile("vst3shim_stub");
        }
    }
}
