cask "pushback" do
  arch arm: "arm64", intel: "x64"

  version "0.6.0"
  sha256 arm:   "5655bb6412fb918ca9e4c6ebe220be0c78ba8ebddf110023e91eee99c1a07a8d",
         intel: "4bcdc6e709f97b2dd528f80158f7c71f3572bdc6c19a1f866b1fbf4e62478457"

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
