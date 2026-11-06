cask "pushback" do
  arch arm: "arm64", intel: "x64"

  version "0.9.1"
  sha256 arm:   "b583cb99546e0bb5e30db566ba05c5d9ddf6c5fe28f6f3377b1e41a701ce0a75",
         intel: "570fbb4f16dfaab413f8801e36763455b55d12fb5b77f83e1c87b6c19ae8d7a6"

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
