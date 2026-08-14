//! macOS launchd definition for a resident (KeepAlive) always-on service.
//!
//! Unlike `os::monitor_service`'s `StartInterval`-based periodic tick,
//! this plist asks launchd to keep the program continuously running and
//! to restart it if it exits — the actual "always-on" behavior this
//! module exists for.

#[cfg(any(test, target_os = "macos"))]
use super::manager::{home, identity, xml_escape, Invocation, PlatformPlan, ServiceDefinition};
#[cfg(any(test, target_os = "macos"))]
use anyhow::Result;
#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(target_os = "macos")]
pub(crate) fn plan(def: &ServiceDefinition) -> Result<PlatformPlan> {
    let label = format!("com.yana.service.{}", identity(def));
    let path = home()?
        .join("Library/LaunchAgents")
        .join(format!("{label}.plist"));
    let content = render_plist(&label, def);
    Ok(PlatformPlan {
        paths: vec![path.clone()],
        contents: vec![content],
        start: vec![
            Invocation {
                program: "launchctl".into(),
                args: vec!["unload".into(), path.display().to_string()],
                tolerate_failure: true,
            },
            Invocation {
                program: "launchctl".into(),
                args: vec!["load".into(), path.display().to_string()],
                tolerate_failure: false,
            },
        ],
        stop: vec![Invocation {
            program: "launchctl".into(),
            args: vec!["unload".into(), path.display().to_string()],
            tolerate_failure: true,
        }],
    })
}

#[cfg(target_os = "macos")]
pub(crate) fn is_active(label: &str) -> Option<bool> {
    let full_label = format!("com.yana.service.{label}");
    Command::new("launchctl")
        .args(["list", &full_label])
        .output()
        .ok()
        .map(|output| output.status.success())
}

#[cfg(any(test, target_os = "macos"))]
pub(crate) fn render_plist(label: &str, def: &ServiceDefinition) -> String {
    let mut argument_tags = format!(
        "<string>{}</string>",
        xml_escape(&def.program.display().to_string())
    );
    for arg in &def.args {
        argument_tags.push_str(&format!("<string>{}</string>", xml_escape(arg)));
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>{label}</string>
<key>ProgramArguments</key><array>{argument_tags}</array>
<key>WorkingDirectory</key><string>{wd}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ProcessType</key><string>Background</string>
<key>ThrottleInterval</key><integer>10</integer>
</dict></plist>
"#,
        label = xml_escape(label),
        wd = xml_escape(&def.working_directory.display().to_string()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn definition() -> ServiceDefinition {
        ServiceDefinition {
            name: "yana-rt-service".into(),
            description: "Yana always-on service".into(),
            program: PathBuf::from("/Applications/Yana AI/yana-rt"),
            args: vec!["os".into(), "service".into(), "run".into()],
            working_directory: PathBuf::from("/tmp/project & one"),
        }
    }

    #[test]
    fn renders_a_keep_alive_plist_without_a_shell() {
        let plist = render_plist("com.yana.service.test", &definition());
        assert!(plist.contains("/Applications/Yana AI/yana-rt"));
        assert!(plist.contains("project &amp; one"));
        assert!(plist.contains("<key>KeepAlive</key><true/>"));
        assert!(plist.contains("<string>os</string><string>service</string><string>run</string>"));
        assert!(!plist.contains("/bin/sh"));
    }
}
