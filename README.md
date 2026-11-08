# Sổ của bé

Web app (PWA) ghi bú, tã, ngủ của bé bằng một chạm. Bố và mẹ dùng chung dữ liệu qua Firebase Firestore. Mở từ icon trên màn hình chính sẽ chạy từ cache của máy, vẫn ghi được khi mất mạng.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html` | Giao diện và CSS |
| `app.js` | Logic: ghi nhanh, nhật ký, sửa, đồng bộ Firestore |
| `config.js` | `firebaseConfig` của project (không phải bí mật) |
| `firebase.js` | Firebase SDK đã bundle, build bằng `npm run build:firebase` |
| `sw.js` | Service worker: cache app để mở tức thì và chạy offline |
| `manifest.webmanifest`, `icons/` | Thông tin cài lên màn hình chính |
| `fonts/` | Font Lexend tự host (latin + vietnamese) |
| `scripts/` | Entry để bundle Firebase, script tạo icon |

## Dữ liệu trong Firestore

- `days/{YYYY-MM-DD}`: `{ date, events: { <id>: event } }`, mỗi ngày một document.
- `active/feed`, `active/sleep`: cữ bú hoặc giấc ngủ đang chạy.
- `meta/baby`: tên và ngày sinh của bé.
- `members/{uid}`: email của người đã đăng nhập (để hiện ai ghi).

Quyền truy cập do Firestore Rules quyết định: chỉ các email trong danh sách được đọc và ghi.

## Thêm người dùng

1. Firebase console, Authentication, Users, Add user.
2. Thêm email đó vào danh sách trong Firestore Rules, rồi Publish.

## Cập nhật app

Sửa file, tăng `VERSION` trong `sw.js`, rồi push lên `main`. Điện thoại sẽ nhận bản mới ở lần mở sau.

## Build lại Firebase SDK

```
npm install
npm run build:firebase
```
