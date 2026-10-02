{
  description = "Firefox ESR development shell for the Tarnished extension";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      firefox = pkgs.firefox-esr;
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = [ firefox ];
        FIREFOX_BIN = pkgs.lib.getExe firefox;
        shellHook = ''
          echo "Tarnished dev shell: firefox-esr -> $FIREFOX_BIN"
        '';
      };
    };
}
