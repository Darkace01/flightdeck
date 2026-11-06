cask "pushback" do
  arch arm: "arm64", intel: "x64"

  version "0.8.0"
  sha256 arm:   "41a22b57b0868ca3657a8051d6d062e7ce7d7e3fe669a8f1c80aa7a66b165d7a",
         intel: "664bc8fd62c44112f847f2ee9a8319dd1f43df632352f86a959397b76cae9ddc"

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
