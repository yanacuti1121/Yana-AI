//! flock-v1 acquire-then-exec bridge for command-shaped callers.

#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(unix)]
use std::process::Command;
use std::time::Duration;

pub fn cmd_lock_identity(resource: &str) -> i32 {
    let result = (|| -> anyhow::Result<()> {
        let project_root = yana_rt::flock_v1::project_root_from_env()?;
        let identity = yana_rt::flock_v1::canonical_identity(resource, &project_root)?;
        let path = yana_rt::flock_v1::lock_path(&project_root, &identity);
        println!("{identity}\t{}", path.display());
        Ok(())
    })();
    match result {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("lock-identity: {error:#}");
            2
        }
    }
}

pub fn cmd_lock_with(resource: &str, timeout_secs: u64, command: &[String]) -> i32 {
    #[cfg(not(unix))]
    {
        let _ = (resource, timeout_secs, command);
        eprintln!("lock-with: flock-v1 is supported only on macOS and Linux");
        return 2;
    }

    #[cfg(unix)]
    {
        let Some((program, args)) = command.split_first() else {
            eprintln!("lock-with: no command given");
            return 2;
        };

        let result = (|| -> anyhow::Result<()> {
            let project_root = yana_rt::flock_v1::project_root_from_env()?;
            let identity = yana_rt::flock_v1::canonical_identity(resource, &project_root)?;
            let guard = yana_rt::flock_v1::acquire(
                &identity,
                &project_root,
                Duration::from_secs(timeout_secs),
            )?;
            guard.clear_cloexec_for_exec()?;
            let error = Command::new(program).args(args).exec();
            drop(guard);
            Err(error.into())
        })();

        match result {
            Ok(()) => unreachable!("CommandExt::exec only returns on failure"),
            Err(error) => {
                eprintln!("lock-with: {error:#}");
                2
            }
        }
    }
}
