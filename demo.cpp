#include <librealsense2/rs.hpp>

#include <cstdio>
#include <chrono>
#include <sys/stat.h>

static void save_ppm(const char* path, const rs2::video_frame& frame) {
    int w = frame.get_width();
    int h = frame.get_height();
    int bpp = frame.get_bytes_per_pixel();
    FILE* f = fopen(path, "wb");
    fprintf(f, "P6\n%d %d\n255\n", w, h);
    fwrite(frame.get_data(), 1, w * h * bpp, f);
    fclose(f);
}

static void save_pgm16(const char* path, const rs2::depth_frame& frame) {
    int w = frame.get_width();
    int h = frame.get_height();
    FILE* f = fopen(path, "wb");
    fprintf(f, "P5\n%d %d\n65535\n", w, h);
    fwrite(frame.get_data(), 1, w * h * 2, f);
    fclose(f);
}

int main() {
    mkdir("output", 0755);
    rs2::pipeline pipe;
    rs2::config cfg;
    cfg.enable_stream(RS2_STREAM_DEPTH, 848, 480, RS2_FORMAT_Z16, 10);
    cfg.enable_stream(RS2_STREAM_COLOR, 1280, 720, RS2_FORMAT_RGB8, 15);

    rs2::pipeline_profile profile = pipe.start(cfg);
    rs2::device dev = profile.get_device();
    printf("Device: %s  serial=%s\n",
           dev.get_info(RS2_CAMERA_INFO_NAME),
           dev.get_info(RS2_CAMERA_INFO_SERIAL_NUMBER));

    auto t0 = std::chrono::steady_clock::now();
    for (int i = 0; i < 30; ++i)
        pipe.wait_for_frames();
    auto t1 = std::chrono::steady_clock::now();
    double dt = std::chrono::duration<double>(t1 - t0).count();

    rs2::depth_frame depth = pipe.wait_for_frames().get_depth_frame();
    rs2::frameset last = pipe.wait_for_frames();
    rs2::video_frame color = last.get_color_frame();

    save_ppm("output/color.ppm", color);
    save_pgm16("output/depth.pgm", depth);

    float scale = depth.get_units();
    int w = depth.get_width();
    int h = depth.get_height();
    const uint16_t* p = static_cast<const uint16_t*>(depth.get_data());
    uint64_t center = p[h / 2 * w + w / 2];
    printf("Captured 30 frames in %.2fs (%.1f FPS)\n", dt, 30.0 / dt);
    printf("Depth scale: %.6f m\n", scale);
    printf("Center distance: %.1f mm\n", center * scale * 1000.0);

    uint64_t sum = 0, valid = 0, mn = 65535, mx = 0;
    for (int i = 0; i < w * h; ++i) {
        if (p[i] > 0) {
            sum += p[i];
            ++valid;
            if (p[i] < mn) mn = p[i];
            if (p[i] > mx) mx = p[i];
        }
    }
    printf("Valid depth pixels: %llu / %d (%.1f%%)\n",
           (unsigned long long)valid, w * h, 100.0 * valid / (w * h));
    if (valid)
        printf("Min / Mean / Max depth: %.2f / %.2f / %.2f m\n",
               mn * scale, (double)sum / valid * scale, mx * scale);

    pipe.stop();
    return 0;
}