#include <napi.h>
#include <librealsense2/rs.hpp>

#include <chrono>
#include <cstdint>
#include <string>
#include <thread>
#include <vector>

namespace {

struct StreamCfg {
  int width = 0, height = 0, fps = 0;
};

struct CaptureConfig {
  StreamCfg depth{848, 480, 10};
  StreamCfg color{1280, 720, 15};
  int frames = 30;
  int warmup = 5;
};

struct CaptureResult {
  std::string device_name;
  std::string serial;
  int color_w = 0, color_h = 0;
  std::vector<uint8_t> color_raw;
  int depth_w = 0, depth_h = 0;
  std::vector<uint16_t> depth_raw;
  float depth_scale = 0.f;
  double fps = 0.0;
  float center_mm = 0.f;
  double valid_pct = 0.0;
  float min_m = 0.f, mean_m = 0.f, max_m = 0.f;
  std::string error;
};

CaptureResult Capture(const CaptureConfig& cfg) {
  const int kMaxAttempts = 3;
  CaptureResult r;
  std::string last_error;

  for (int attempt = 1; attempt <= kMaxAttempts; ++attempt) {
    r = CaptureResult{};
    last_error.clear();
    try {
      rs2::pipeline pipe;
      rs2::config config;
      config.enable_stream(RS2_STREAM_DEPTH, cfg.depth.width, cfg.depth.height,
                           RS2_FORMAT_Z16, cfg.depth.fps);
      config.enable_stream(RS2_STREAM_COLOR, cfg.color.width, cfg.color.height,
                           RS2_FORMAT_RGB8, cfg.color.fps);

      rs2::pipeline_profile profile = pipe.start(config);
      rs2::device dev = profile.get_device();
      r.device_name = dev.get_info(RS2_CAMERA_INFO_NAME);
      r.serial = dev.get_info(RS2_CAMERA_INFO_SERIAL_NUMBER);

      rs2::frameset last;
      for (int i = 0; i < cfg.warmup; ++i) last = pipe.wait_for_frames();
      auto t0 = std::chrono::steady_clock::now();
      for (int i = 0; i < cfg.frames; ++i) last = pipe.wait_for_frames();
      auto t1 = std::chrono::steady_clock::now();
      double dt = std::chrono::duration<double>(t1 - t0).count();
      r.fps = dt > 0 ? cfg.frames / dt : 0.0;

      rs2::depth_frame d = last.get_depth_frame();
      rs2::video_frame c = last.get_color_frame();

      r.depth_scale = d.get_units();
      r.depth_w = d.get_width();
      r.depth_h = d.get_height();
      const uint16_t* dp = static_cast<const uint16_t*>(d.get_data());
      r.depth_raw.assign(dp, dp + r.depth_w * r.depth_h);

      r.color_w = c.get_width();
      r.color_h = c.get_height();
      const uint8_t* cp = static_cast<const uint8_t*>(c.get_data());
      r.color_raw.assign(cp, cp + r.color_w * r.color_h * 3);

      size_t center_depth = 0;
      if (r.depth_h > 0 && r.depth_w > 0)
        center_depth =
            r.depth_raw[(r.depth_h / 2) * r.depth_w + (r.depth_w / 2)];
      r.center_mm = center_depth * r.depth_scale * 1000.f;

      uint64_t sum = 0, valid = 0;
      uint16_t mn = 65535, mx = 0;
      for (auto v : r.depth_raw) {
        if (v > 0) {
          sum += v;
          ++valid;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      r.valid_pct = r.depth_raw.empty() ? 0.0 : 100.0 * valid / r.depth_raw.size();
      if (valid) {
        r.min_m = mn * r.depth_scale;
        r.mean_m = static_cast<float>(static_cast<double>(sum) / valid) * r.depth_scale;
        r.max_m = mx * r.depth_scale;
      }
      pipe.stop();
      return r;
    } catch (const rs2::error& e) {
      last_error = std::string("realsense error: ") + e.what();
    } catch (const std::exception& e) {
      last_error = std::string("error: ") + e.what();
    }

    if (attempt < kMaxAttempts) {
      std::this_thread::sleep_for(std::chrono::seconds(2));
      if (attempt == kMaxAttempts - 1) {
        try {
          rs2::context ctx;
          auto devs = ctx.query_devices();
          if (devs.size() > 0) devs.front().hardware_reset();
          std::this_thread::sleep_for(std::chrono::seconds(6));
        } catch (...) {
        }
      }
    }
  }

  r.error = last_error;
  return r;
}

void SetRes(Napi::Value v, StreamCfg* out) {
  if (!v.IsObject()) return;
  Napi::Object o = v.As<Napi::Object>();
  if (o.Has("width")) out->width = o.Get("width").As<Napi::Number>().Int32Value();
  if (o.Has("height")) out->height = o.Get("height").As<Napi::Number>().Int32Value();
  if (o.Has("fps")) out->fps = o.Get("fps").As<Napi::Number>().Int32Value();
}

CaptureConfig ParseConfig(const Napi::CallbackInfo& info) {
  CaptureConfig cfg;
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object o = info[0].As<Napi::Object>();
    if (o.Has("frames")) cfg.frames = o.Get("frames").As<Napi::Number>().Int32Value();
    if (o.Has("warmup")) cfg.warmup = o.Get("warmup").As<Napi::Number>().Int32Value();
    if (o.Has("depth")) SetRes(o.Get("depth"), &cfg.depth);
    if (o.Has("color")) SetRes(o.Get("color"), &cfg.color);
  }
  if (cfg.frames < 1) cfg.frames = 1;
  return cfg;
}

Napi::Object ToResult(const Napi::Env& env, const CaptureResult& r) {
  Napi::Object o = Napi::Object::New(env);

  Napi::Object dev = Napi::Object::New(env);
  dev.Set("name", r.device_name);
  dev.Set("serial", r.serial);
  o.Set("device", dev);

  Napi::Object color = Napi::Object::New(env);
  color.Set("width", r.color_w);
  color.Set("height", r.color_h);
  color.Set("data", Napi::Buffer<uint8_t>::Copy(env, r.color_raw.data(), r.color_raw.size()));
  o.Set("color", color);

  Napi::Object depth = Napi::Object::New(env);
  depth.Set("width", r.depth_w);
  depth.Set("height", r.depth_h);
  depth.Set("scale", r.depth_scale);
  depth.Set("data", Napi::Buffer<uint16_t>::Copy(env, r.depth_raw.data(), r.depth_raw.size()));
  o.Set("depth", depth);

  Napi::Object stats = Napi::Object::New(env);
  stats.Set("fps", r.fps);
  stats.Set("centerMm", r.center_mm);
  stats.Set("validPct", r.valid_pct);
  stats.Set("minM", r.min_m);
  stats.Set("meanM", r.mean_m);
  stats.Set("maxM", r.max_m);
  o.Set("stats", stats);

  return o;
}

class CaptureWorker : public Napi::AsyncWorker {
 public:
  CaptureWorker(const Napi::Env& env, CaptureConfig cfg)
      : Napi::AsyncWorker(env), cfg_(cfg),
        deferred_(Napi::Promise::Deferred::New(env)) {}

  void Execute() override { result_ = Capture(cfg_); }

  void OnOK() override {
    Napi::HandleScope scope(Env());
    if (!result_.error.empty()) {
      deferred_.Reject(Napi::Error::New(Env(), result_.error).Value());
      return;
    }
    deferred_.Resolve(ToResult(Env(), result_));
  }

  void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

  Napi::Promise Promise() { return deferred_.Promise(); }

 private:
  CaptureConfig cfg_;
  CaptureResult result_;
  Napi::Promise::Deferred deferred_;
};

Napi::Value CaptureSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  CaptureResult r = Capture(ParseConfig(info));
  if (!r.error.empty())
    throw Napi::Error::New(env, r.error);
  return ToResult(env, r);
}

Napi::Value CaptureAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto* worker = new CaptureWorker(env, ParseConfig(info));
  worker->Queue();
  return worker->Promise();
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("capture", Napi::Function::New(env, CaptureAsync));
  exports.Set("captureSync", Napi::Function::New(env, CaptureSync));
  exports.Set("getVersion", Napi::Function::New(
      env, [](const Napi::CallbackInfo& info) {
        return Napi::String::New(info.Env(), "2.58.4 (realsense-napi 0.4.0)");
      }));
  return exports;
}

NODE_API_MODULE(realsense, Init)