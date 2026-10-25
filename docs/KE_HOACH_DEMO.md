# Kịch bản demo và checklist chụp minh chứng — Đề 24

## Thứ tự demo đề xuất (8–12 phút)

| Thứ tự | Màn hình/Thao tác | Kết quả cần quan sát | Minh chứng |
|---|---|---|---|
| 1 | Mở GitHub repository, tab Commits | Đủ 3–4 commit có ý nghĩa, README | H01 |
| 2 | `docker compose ps` | Toàn bộ dịch vụ Up/healthy | H02 |
| 3 | Website `http://localhost:8080` | Màn login hoạt động | H03 |
| 4 | Đăng nhập admin, tạo task, giao cho nhân viên, sửa trạng thái, xóa thử | Tạo/đọc/sửa/xóa thực tế | H04 |
| 5 | pgAdmin → users/tasks | Dữ liệu đồng bộ với giao diện | H05 |
| 6 | `curl.exe -I http://localhost:8080/` | Security headers từ Nginx | H06 |
| 7 | Prometheus `/targets` | Tất cả hoặc các job chính UP, ghi rõ job không UP | H07 |
| 8 | Grafana Dashboard | Chỉ số request/DB/nginx/container thay đổi khi có traffic | H08 |
| 9 | Grafana Explore → Loki | 3 LogQL queries có dòng log thực tế | H09-H11 |
| 10 | `docker compose exec app id`, `nginx id`, `docker network ls` | Non-root, network isolation | H12 |

## Chỗ đặt ảnh trong báo cáo

Báo cáo Word để sẵn các vị trí `[CHÈN ẢNH Hxx]`. Sau khi chạy trên máy, hãy chèn ảnh chụp **thực tế** và ghi chú thời điểm/demo. Không được sử dụng ảnh minh họa kiến trúc để thay ảnh chứng cứ triển khai.

## 3 truy vấn LogQL bắt buộc

```logql
{job="tasktracker-app"}
{job="tasktracker-app", level="warn"} |= "login_failed"
{job="tasktracker-nginx", status="200"}
```

Nếu `level="warn"` chưa có log, cố tình đăng nhập sai 1 lần, không lặp quá nhiều do giới hạn tần suất.

## Thông tin cần điền trước nộp

- Trường, Khoa, lớp, môn, giảng viên.
- Họ tên, MSSV, ngày nộp, URL GitHub repository.
- Tình trạng thực thi Docker thực tế; không ghi 100% Passed nếu chưa chạy.
- Đường dẫn commit hash và ảnh chụp trên GitHub.
