# To learn more about how to use Nix to configure your environment
# see: https://firebase.google.com/docs/studio/customize-workspace
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-24.05"; # or "unstable"

  # Use https://search.nixos.org/packages to find packages
  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.curl
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.nodejs_22
    # pkgs.go
    # pkgs.nodePackages.nodemon
  ];



  # Sets environment variables in the workspace
  env = {};
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      # "vscodevim.vim"
    ];

    # Enable previews
    previews = {
      enable = true;
      previews = {
        web = {
          command = ["node" "tools/yana-web/server.js"];
          manager = "web";
          env = {
            PORT = "$PORT";
          };
        };
      };
    };

    # Workspace lifecycle hooks
    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        npm-install = "cd tools/yana-web && npm install --legacy-peer-deps";
      };
      # Runs when the workspace is (re)started
      onStart = {
        start-9router = "9router &";
        yana-web = "cd /home/user/yamtam-engine/tools/yana-web && node server.js &";
      };
    };
  };
}
