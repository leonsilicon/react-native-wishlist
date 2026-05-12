require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# This package only supports the New Architecture.
# As of React Native 0.82+, the New Architecture is the default. We only fail
# if it was explicitly disabled.
if ENV["RCT_NEW_ARCH_ENABLED"] == "0"
  raise "react-native-wishlist requires the New Architecture. " \
        "Please remove RCT_NEW_ARCH_ENABLED=0 before running `pod install`."
end

Pod::Spec.new do |s|
  s.name         = "MGWishList"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.description  = <<-DESC
                  The fastest List component for React Native.
                   DESC
  s.homepage     = "https://github.com/margelo/react-native-wishlist"
  s.license      = "MIT"
  # s.license    = { :type => "MIT", :file => "FILE_LICENSE" }
  s.author       = { "author" => "author@domain.cn" }
  s.platforms    =  { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/margelo/react-native-wishlist.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{mm,h,m,cpp,hpp}",
    "cpp/**/*.{cpp,h,m,mm,hpp}",
  ]

  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) RCT_NEW_ARCH_ENABLED=1",
  }

  install_modules_dependencies(s)
end

