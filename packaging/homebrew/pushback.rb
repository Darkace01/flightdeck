cask "pushback" do
  arch arm: "arm64", intel: "x64"

  version "0.5.0"
  sha256 arm:   "a69e5e3bdd34bebc6b71b1877c1e22de2fee8d8f828120b252537be3444e540b",
         intel: "8aceedd02774b8984a9e868d0c699eb921487dbf5ab6d7bdb677564b9c6908c8"

  url "https://github.com/Darkace01/pushback/releases/download/v#{version}/Pushback-#{version}-mac-#{arch}.dmg"
  name "Pushback"
  desc "Desktop dashboard for GitHub Actions and pull requests"
  homepage "https://github.com/Darkace01/pushback"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :monterey"

  app "Pushback.app"

  # Releases aren't signed or notarised yet, so clear the download quarantine
  # flag; otherwise Gatekeeper refuses to open the app the first time.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Pushback.app"]
  end

  zap trash: [
    "~/Library/Application Support/Pushback",
    "~/Library/Preferences/dev.pushback.app.plist",
    "~/Library/Saved Application State/dev.pushback.app.savedState",
  ]
end
