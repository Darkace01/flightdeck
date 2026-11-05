cask "pushback" do
  arch arm: "arm64", intel: "x64"

  version "0.2.0"
  sha256 arm:   "ebb91bdf71961e5e8f209201275d5803cafd34e4803d5363fe3fc46e7865db3f",
         intel: "5e90feeecb90f40cc6ab9b5378c9873fac5f157d8c512a1b00a5fdeb220c33ab"

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
