# TASKFLOW — Hệ thống quản lý công việc (Đề 24)

Bài thực hành môn **Triển khai và Quản trị Hệ thống Phần mềm**. Ứng dụng web quản lý công việc cá nhân/nhóm, gồm **task, deadline, trạng thái**, triển khai toàn bộ bằng **Docker Compose**, PostgreSQL/pgAdmin, Nginx Reverse Proxy, Prometheus/Grafana, Loki/Promtail, cAdvisor và các exporter. 

> **Trạng thái bàn giao:** cấu hình và mã nguồn đã chuẩn bị, kiểm tra cú pháp YAML/JavaScript và 6 bài kiểm thử dữ liệu. Cần chạy Docker trên máy của sinh viên để xác minh tất cả container, capture dashboard và nộp minh chứng thực tế. Không nên ghi "đã demo thành công" nếu chưa chạy.

## 1. Yêu cầu máy (Windows 11)

- Docker Desktop + WSL 2, chọn chế độ **Linux containers**.
- Git, Python 3 (để sinh mật khẩu và chạy smoke test), trình duyệt web.
- Kết nối Internet lần đầu để tải image và gói Node.
- Khuyến nghị RAM ít nhất 8 GB, dành khoảng 4–6 GB cho Docker; đĩa trống tối thiểu 8 GB.

## 2. Khởi động từ PowerShell

```powershell
cd <duong-dan-toi-thu-muc-TaskTracker_De24>
python scripts/init-env.py
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

**Giữ bí mật file `.env`**; file này đã có trong `.gitignore`. Script sinh các mật khẩu khó đoán và hiển thị tài khoản demo **một lần** trong terminal. Có thể mở `.env` trên máy mình để xem lại. **Không chụp hoặc đưa mật khẩu/secret vào báo cáo hay GitHub.**

### Các địa chỉ để demo

| Thành phần | Địa chỉ trên máy cá nhân |
|---|---|
| Website (qua Nginx) | http://localhost:8080 |
| pgAdmin | http://localhost:5050 |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090/targets |
| Loki | Không public; truy vấn bằng Grafana Explore |
| App / PostgreSQL | Không mở cổng trực tiếp ra máy host |

Đăng nhập website: **admin** hoặc **nhanvien**; mật khẩu theo `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_MEMBER_PASSWORD` trong `.env`. Grafana: `GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD`. pgAdmin: `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD`.

**Kết nối pgAdmin:** Servers → Register → Server: Name `TaskTracker DB`; tab Connection: Host `postgres`, Port `5432`, Maintenance database `tasktracker`, Username `task_app`, Password lấy từ `APP_DB_PASSWORD` trong `.env`. Nếu đã tùy biến `.env`, dùng giá trị tương ứng. Truy cập `Databases → tasktracker → Schemas → public → Tables → users/tasks`.

## 3. Chức năng và phân quyền

- Đăng nhập bằng cookie HTTP-only JWT; đăng xuất; mật khẩu băm `bcrypt`.
- Tạo, xem danh sách, sửa, xóa công việc; hạn hoàn thành, mức ưu tiên, trạng thái và người thực hiện.
- Tìm kiếm công việc; lọc trạng thái; thống kê công việc, hoàn thành và quá hạn.
- Quản trị viên xem mọi công việc và giao cho người khác.
- Nhân viên xem công việc tự tạo hoặc được giao; người được giao có thể cập nhật **trạng thái**. Người tạo có thể quản lý nội dung task do mình tạo.
- Kiểm tra input, SQL có tham số, hạn chế lạm dụng đăng nhập, xác thực quyền trên server.

Lưu ý: user demo chỉ được tạo lần đầu (INSERT IF NOT EXISTS); nếu sau đó sửa mật khẩu trong `.env` mà giữ volume DB, mật khẩu user trong DB **không đổi**. Để reset môi trường demo (xóa dữ liệu), đọc mục 9.

## 4. Sơ đồ luồng triển khai

```text
Browser ──localhost:8080──> Nginx (non-root, headers)
                                │ reverse_proxy
                                ▼
                         Node.js / Express
                           │          │ /metrics
                           ▼          └─────────────┐
                      PostgreSQL                    │
                           ▲                        ▼
                      pgAdmin          Prometheus < exporters
                                            │
                                         Grafana

App/Nginx log files → Promtail → Loki → Grafana Explore (LogQL)
Container metrics → cAdvisor → Prometheus → Grafana
Postgres metrics → postgres-exporter → Prometheus
Nginx metrics → nginx-exporter → Prometheus
```

Docker networks: `app_net` (nginx↔app), `db_net` (app/pgAdmin/exporter↔DB), `ops_net` (metrics/logs), `admin_net` (pgAdmin/Grafana/Prometheus trên localhost) và `edge_net` (cổng Nginx). Ba mạng nội bộ có `internal: true`. Postgres/ứng dụng không publish ports.

## 5. Demo giám sát Prometheus & Grafana (1,5 điểm)

1. Mở `http://localhost:9090/targets`: tìm các job `tasktracker-app`, `nginx`, `postgres`, `cadvisor`, `prometheus`; mục tiêu là trạng thái **UP**.
2. Mở Grafana `http://localhost:3001` → Dashboards → **TaskTracker** → **TaskTracker - Tổng quan hệ thống**.
3. Thực hiện tạo/sửa/xóa nhiệm vụ trên website; chờ 15–30 giây để đồ thị cập nhật.
4. Kiểm tra các panel: HTTP requests, p95 latency, Nginx connections, DB connections, CPU/RAM container.
5. Nếu panel trống: kiểm tra target trong Prometheus; một số metric của cAdvisor có thể bị giới hạn trong Docker Desktop/WSL2.

PromQL minh họa:

```promql
up{job=~"tasktracker-app|nginx|postgres|cadvisor"}
sum(rate(tasktracker_http_requests_total[5m]))
nginx_connections_active
sum(pg_stat_activity_count)
sum by (name)(container_memory_working_set_bytes{image!=""})
```

## 6. Demo Loki + Promtail + LogQL (1,5 điểm)

Grafana → Explore → chọn datasource **Loki**; đổi time range `Last 1 hour`. Tạo vài công việc, thử đăng nhập sai mật khẩu và refresh trang để sinh log.

**Ba truy vấn LogQL bắt buộc có thể trình bày:**

```logql
{job="tasktracker-app"}
{job="tasktracker-app", level="warn"} |= "login_failed"
{job="tasktracker-nginx", status="200"}
```

Truy vấn bổ sung:

```logql
sum(count_over_time({job="tasktracker-app"}[5m]))
{job="tasktracker-app", event="task_created"}
```

Luồng log: App ghi JSON Lines vào `app_logs`, Nginx ghi access JSON vào `nginx_logs`, Promtail tail file, đẩy Loki và Grafana Explore hiển thị. Không phụ thuộc đường dẫn Docker JSON log trên Windows.

> **Lưu ý công nghệ:** Promtail đã ngừng hỗ trợ chính thức trong năm 2026. Ở bài này tiếp tục sử dụng vì **giáo trình yêu cầu đích danh Promtail**; với môi trường vận hành thực tế nên lên kế hoạch chuyển sang Grafana Alloy.

## 7. Hardening — 5 biện pháp để chấm (1,5 điểm)

1. **Non-root:** Node image `USER node`; Nginx `nginx-unprivileged` chạy UID 101.
2. **Network isolation:** mạng `app_net`, `db_net`, `ops_net` tách nhau; database không mở cổng host.
3. **Mật khẩu mạnh:** script sinh bí mật ngẫu nhiên; `.env` không commit; hash `bcrypt`.
4. **Giảm quyền:** container App/Nginx `cap_drop: [ALL]`, `no-new-privileges`, ứng dụng dùng DB role `task_app` không phải superuser; exporter dùng `pg_monitor`.
5. **HTTP security:** Nginx set `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`; ứng dụng dùng Helmet, cookie HttpOnly + SameSite.

```powershell
docker compose exec app id
docker compose exec nginx id
docker inspect tasktracker-de24-app-1 --format '{{.HostConfig.ReadonlyRootfs}}'
curl.exe -I http://localhost:8080/
docker compose exec postgres psql -U postgres -d tasktracker -c "\du"
```

**HTTPS:** yêu cầu đề bài cho phép **HTTPS tự ký hoặc headers bảo mật cơ bản**. Bản này sử dụng headers thay cho HTTPS để demo localhost. Không đưa ra Internet với HTTP; nếu triển khai internet, cấu hình TLS và `COOKIE_SECURE=true`, xác thực trước Grafana/Prometheus, quản lý secrets chuyên dụng.

## 8. Chạy kiểm tra và lấy minh chứng

```powershell
python scripts/smoke-test.py
docker compose logs --tail=60 app nginx postgres prometheus grafana loki promtail
docker compose ps
```

Chụp ảnh màn hình vào báo cáo: (1) GitHub có repo/3+ commit, (2) website login/dashboard + CRUD, (3) pgAdmin hai bảng, (4) Nginx headers qua `curl.exe -I`, (5) Prometheus Targets UP, (6) dashboard Grafana, (7) ba truy vấn LogQL có log trả về, (8) `docker compose ps`, (9) non-root & network/DB rights. Không dùng ảnh giả.

## 9. Xử lý lỗi thường gặp

- **Docker engine is stopped:** khởi động Docker Desktop, bật WSL 2 integration; dùng `docker info`.
- **Port 8080/5050/3001/9090 occupied:** sửa phía **trái** của port mapping trong `docker-compose.yml` và URL tương ứng.
- **Image pull error:** kiểm tra mạng, VPN, đăng nhập registry phù hợp; dùng `docker compose pull` để xem image nào bị lỗi.
- **App failed to start:** `docker compose logs postgres app`; kiểm tra `.env` và tình trạng Postgres role/schema. Các script `db/init` chỉ chạy khi volume `pg_data` **mới**.
- **Grafana panel No data:** mở Prometheus `/targets`; lỗi exporter DB thường do DB đã tạo trước khi cấu hình metrics role.
- **Loki no logs:** `docker compose logs promtail loki`; tạo traffic qua Nginx và chọn time range `Last 1 hour`.
- **Docker Desktop Windows & cAdvisor:** host mounts/metrics có thể hạn chế; xem `docker compose logs cadvisor`. Nếu chỉ cAdvisor lỗi, thử chạy trong WSL2/Linux Docker Engine có đủ host mounts.
- **Reset sạch dữ liệu (không thể khôi phục):** `docker compose down -v` rồi `docker compose up -d --build`; **toàn bộ database, Grafana settings, log/metrics history sẽ bị xóa**.
- **Thay đổi mật khẩu DB sau khi đã có volume:** `.env` thay đổi không tự cập nhật role hiện có. Khởi tạo mới bằng `down -v` **chỉ khi chấp nhận xóa dữ liệu**.

## 10. Đưa lên GitHub — tối thiểu 3 commit (1,5 điểm)

**Bắt buộc:** tạo tài khoản GitHub theo mã SV theo hướng dẫn giảng viên; đặt repository `tasktracker-de24-<MSSV>` và cập nhật bìa báo cáo. Không push `.env`. Các lệnh sau tạo các mốc commit có ý nghĩa, sau khi giải nén **trong thư mục dự án**:

```powershell
git init
git branch -M main
git config user.name "HO_TEN_SINH_VIEN"
git config user.email "EMAIL_GITHUB_CUA_BAN"

git add .gitignore .dockerignore .env.example docker-compose.yml app db nginx scripts/init-env.py
git commit -m "feat: task tracker application, PostgreSQL and Nginx proxy"

git add prometheus grafana
git commit -m "feat: Prometheus Grafana dashboards and exporters config"

git add loki promtail
git commit -m "feat: centralized logging with Loki Promtail and LogQL"

git add README.md docs scripts/smoke-test.py
git commit -m "docs: deployment guide security checks and report"

git remote add origin https://github.com/TAI_KHOAN/REPO.git
git push -u origin main
```

Ghi chú: `docker-compose.yml` ở commit đầu đã chứa cấu hình cho cả monitoring/logging nhưng các file cấu hình được bổ sung ở commit sau. Nếu giảng viên cần **từng commit chạy độc lập**, hãy tách thêm sửa đổi docker-compose theo từng giai đoạn trước khi commit. Trạng thái cuối cùng đầy đủ. GitHub có thể yêu cầu Personal Access Token hoặc SSH key để push.

## 11. Cấu trúc dự án

```text
TaskTracker_De24/
├── app/                    # Express API, giao diện web, test, Dockerfile
├── db/init/                # tạo DB schema, role app và metrics
├── nginx/                  # reverse proxy + security headers
├── prometheus/             # jobs scrape exporter
├── grafana/                # provisioning dashboards + datasources
├── loki/                   # Loki single-node
├── promtail/               # đọc log tập trung
├── scripts/                # sinh secrets + smoke tests
├── docs/                   # hướng dẫn chụp minh chứng + biểu mẫu báo cáo
├── docker-compose.yml
└── README.md
```

Tài liệu thiết kế và quy trình demo: `docs/KE_HOACH_DEMO.md`.

## 12. Tài liệu tham khảo

- Docker Compose: https://docs.docker.com/compose/
- PostgreSQL Docker: https://hub.docker.com/_/postgres
- Nginx Reverse Proxy: https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/
- Prometheus: https://prometheus.io/docs/
- Grafana provisioning: https://grafana.com/docs/grafana/latest/administration/provisioning/
- Loki LogQL: https://grafana.com/docs/loki/latest/query/
- cAdvisor: https://github.com/google/cadvisor
