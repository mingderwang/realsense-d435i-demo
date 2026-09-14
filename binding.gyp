{
  "targets": [
    {
      "target_name": "realsense",
      "sources": ["src/addon.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "/opt/homebrew/include",
        "/opt/homebrew/include/librealsense2"
      ],
      "defines": ["NAPI_VERSION=8", "NAPI_CPP_EXCEPTIONS"],
      "libraries": ["-L/opt/homebrew/lib", "-lrealsense2"],
      "cflags_cc": ["-std=c++17", "-fvisibility=hidden", "-O2", "-fexceptions"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_CXX_LIBRARY": "libc++",
        "OTHER_CPLUSPLUSFLAGS": ["-std=c++17", "-fexceptions"],
        "MACOSX_DEPLOYMENT_TARGET": "13.0",
        "OTHER_LDFLAGS": ["-Wl,-rpath,/opt/homebrew/lib"]
      }
    }
  ]
}