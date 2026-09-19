# Hướng dẫn AI agent: refactor menu EinTheater

## 1. Mục tiêu và phạm vi

Hoàn thiện giao diện theo yêu cầu người dùng: thanh menu gọn, có thứ tự chính xác **EinTheater — File — Edit — Mode**. EinTheater là tên app, được trình bày elegant; File cho phép mở và chọn folder làm workspace; Edit cung cấp Undo/Redo/Copy/Cut; Mode cho phép chuyển giữa Canvas, Data, Debug, Code.

Tài liệu này chuyển plan đã đề xuất thành hướng dẫn triển khai. Các quyết định bổ sung như Paste, màn hình khung cho mode và giới hạn history là mặc định triển khai, không phải tính năng sẵn có. Agent cần đọc lại code thực tế trước khi sửa; bản mô tả hiện trạng bên dưới dựa trên repo tại thời điểm viết.

Kết quả cần là code chạy được, có kiểm thử và báo cáo xác minh. Không kết thúc ở mockup hoặc các nút chỉ có hình thức. Không tự mở rộng thành triển khai đầy đủ Data pipeline, debugger, code editor hay training.

## 2. Hiện trạng phải hiểu trước khi sửa

- `src/main.go` đăng ký Canvas cùng các mode dự kiến Data, Code, Train, Debug.
- `src/studio/routes.go` cung cấp registry `/api/modes`. Mode không có `Page` hiện không có route và bị đánh dấu unavailable.
- Canvas đang có hai page variant: `/` dùng `Canvas/templates/studio.html`; `/canvas` dùng `Canvas/templates/canvas.html`. Ngoài ra có entry point standalone tại `src/Canvas/canvas.go`.
- Hai header tại `Canvas/templates/studio/header.html` và `Canvas/templates/canvas/header.html` đang có dải tab mode và thanh công cụ riêng.
- `src/static/studio/navigation.js` dựng tab mode từ registry và điều hướng bằng đổi trang.
- Chọn folder, native folder picker Windows, workspace tree và save/load model đã có implementation.
- Copy/Cut/Paste đã có tại `Canvas/static/js/clipboard/`. Clipboard graph dùng bộ nhớ và sessionStorage, không đồng nghĩa clipboard text của hệ điều hành.
- Chưa có hệ thống Undo/Redo cho graph. Undo waypoint khi đang vẽ dây không phải lịch sử chỉnh sửa project.
- Go `graph.Store` là nguồn dữ liệu chính; state được chia sẻ giữa các request tới server, không tách theo browser session. Unsaved graph mất khi restart server.
- Shape analysis chạy bất đồng bộ và có thể cập nhật params/metadata. Undo/Redo phải phối hợp với cơ chế này.
- Frontend dùng native ES modules, không có yêu cầu thêm framework hoặc bundler.

Đọc `document.md`, `src/studio/document.md` và các `document.md` trong khu vực định sửa. Tuân thủ `AGENTS.md` nếu tồn tại. Kiểm tra git diff trước khi làm, giữ nguyên thay đổi của người dùng không liên quan.

## 3. Thiết kế giao diện

### 3.1. Thanh menu

```text
EinTheater   File   Edit   Mode                         Canvas
────────────────────────────────────────────────────────────
                       Vùng làm việc
```

- Một thanh menu chính cao khoảng 40px ở kích thước desktop; không còn dải tab mode riêng phía trên.
- Wordmark ghi chính xác `EinTheater`, không bị đổi theo tên model. Dùng typography tinh tế, weight vừa, tracking nhẹ, khoảng cách cân đối.
- Tiếp tục palette tối hiện có: nền trung tính, chữ sáng dễ đọc, border mảnh, một accent tiết chế. Tránh gradient nặng, glow, emoji trang trí và logo quá lớn.
- File/Edit/Mode là nút chữ có vùng click đủ rộng, hover nhẹ và focus nhìn rõ.
- Dropdown dùng chung kích thước chữ, spacing, bo góc, shadow và cách hiển thị shortcut.
- Mode hiện tại có thể hiển thị nhỏ bên phải và có dấu chọn trong menu Mode.
- Tên model và chức năng rename chuyển vào vùng tab/project. Save đặt trong File; Fit View và công cụ connection thuộc toolbar trong vùng Canvas. Clear Canvas đặt trong Edit.
- Giữ đầy đủ đường truy cập tới chức năng hiện có khi di chuyển control. Không để ID hoặc handler cũ bị treo sau khi thay HTML.
- Với cửa sổ nhỏ, ưu tiên giữ wordmark và ba menu; cho phép rút gọn thông tin phụ bên phải. Không cho dropdown tràn viewport hoặc header che workspace.
- Tên folder/model dài phải ellipsis và có cách xem tên đầy đủ bằng title hoặc thông tin trong menu.

### 3.2. Tương tác menu dùng chung

- Chỉ một dropdown mở tại một thời điểm; click lại nút đang mở sẽ đóng.
- Click ngoài, Escape hoặc chọn lệnh thành công sẽ đóng menu theo ngữ cảnh.
- Escape trả focus về nút mở. Tab không bị giữ vô hạn trong menu.
- Hỗ trợ mở bằng Enter/Space, di chuyển item bằng Up/Down, chuyển menu bằng Left/Right; bỏ qua item disabled.
- Nếu dùng ARIA menubar/menu/menuitem, phải triển khai đầy đủ tương tác tương ứng, cùng `aria-expanded`, `aria-controls`, trạng thái disabled/current.
- Không đăng ký listener lặp sau khi reload sidebar hoặc init lại thành phần.
- Action async có trạng thái pending, chặn double submit và hiển thị lỗi có thể hiểu được.
- Khôi phục đúng ngữ cảnh selection/focus khi mở menu; click menu không được vô tình làm mất node đang chọn.

## 4. File và luồng workspace

Menu tối thiểu:

```text
Open Folder…
Save Model                         Ctrl+S
─────────────────────────────────────────
Workspace: <tên folder hoặc chưa chọn>
```

1. Open Folder mở browser folder hiện có. Cho phép duyệt thư mục, nhập path và gọi native picker Windows.
2. Một lần click dòng folder chỉ chọn; double click đi vào folder; nút `Use This Folder` xác nhận thư mục được chọn/đang duyệt.
3. Folder chứa model vẫn có nút Load model riêng. Không tự load model khi người dùng chỉ click để chọn workspace.
4. Chỉ cập nhật workspace sau khi server xác nhận thành công. Đồng bộ tên/path trong menu và cây thư mục.
5. Cancel native picker hoặc đóng dialog giữ nguyên workspace. Path lỗi/không truy cập được hiển thị lỗi trong dialog và cho thử lại.
6. Khi chưa có workspace, vùng workspace hiển thị `Open a folder to get started` và nút mở folder. Không làm mất graph đang có.
7. Save tiếp tục dùng pipeline hiện tại. Nếu chưa chọn folder thì mở luồng chọn folder theo hành vi hiện có; không báo đã save khi mới chọn folder.
8. File phải hoạt động cả trên màn hình khung của các mode. Có thể tách phần workspace UI dùng chung hoặc tạo adapter nhỏ gọi API workspace hiện tại; không import toàn bộ Canvas app vào màn hình khung chỉ để mở folder.
9. Trên mode chưa có tài liệu để save, Save Model disabled có giải thích; Open Folder vẫn dùng được.

Không đổi hợp đồng filesystem/API khi không cần. Workspace và save là hai thao tác riêng.

## 5. Edit và clipboard

```text
Undo                               Ctrl+Z
Redo                         Ctrl+Shift+Z
─────────────────────────────────────────
Cut                                Ctrl+X
Copy                               Ctrl+C
Paste                              Ctrl+V
Select All                         Ctrl+A
─────────────────────────────────────────
Clear Canvas…
```

- Dùng lại `copySelection`, `cutSelection`, `pasteClipboard`, `selectAllNodes` thay vì viết clipboard thứ hai.
- Copy/Cut chỉ enabled khi có selection hợp lệ; Paste khi có clipboard graph; Select All/Clear khi có dữ liệu phù hợp.
- Menu và shortcut gọi cùng command; trạng thái menu được cập nhật khi selection, clipboard, project hoặc history thay đổi.
- Hỗ trợ Ctrl trên Windows và Cmd khi môi trường dùng Meta; có thể bổ sung Ctrl+Y cho Redo trên Windows.
- Không intercept shortcut graph trong input, textarea, select, contenteditable hoặc dialog đang sửa dữ liệu. Giữ native text undo/copy/cut/paste; không hiển thị lệnh graph như thể chúng thao tác text.
- Copy không tạo history. Cut chỉ xóa khi copy thành công và deletion thành công; không toast thành công sai khi request lỗi.
- Paste khôi phục selection cho node mới, giữ liên kết nội bộ và quy tắc remap ID hiện tại.
- Clear có xác nhận phù hợp; khi đã hỗ trợ undo phải bỏ lời cảnh báo sai rằng không thể hoàn tác.
- Mode màn hình khung chưa có editor phải disable các lệnh graph, không âm thầm sửa Canvas ở nền.

## 6. Undo/Redo: thiết kế bắt buộc

### 6.1. Chủ sở hữu và dữ liệu

- Lịch sử nằm ở Go, riêng từng project, giới hạn mặc định 100 thao tác; frontend chỉ hiển thị trạng thái và gọi command.
- Snapshot hoặc inverse-command đều được nếu chứng minh khôi phục đủ dữ liệu. Ưu tiên giải pháp rõ, dễ kiểm thử và phù hợp code hiện tại.
- Nếu dùng snapshot, deep copy dữ liệu nested. Không chỉ sao chép `GraphData` rồi bỏ quên thứ tự node/edge, counters, parent/parentZone, geometry hoặc thông tin project cần thiết.
- Phân biệt dữ liệu người dùng chỉnh với metadata inference. Không ghi history chỉ vì background analysis hoàn tất.
- Tên model nên là một thao tác có thể undo nếu rename đi qua cùng hệ thống; mô tả và test rõ hành vi. Không restore nhầm workspace toàn cục hoặc tham chiếu save bằng snapshot graph cũ.
- Lịch sử tồn tại trong vòng đời server, không cần lưu ra disk. Switch project/mode không xóa history; xóa project giải phóng history.
- Load/import model thành công tạo baseline mới cho project nhận dữ liệu. Không làm mất history khi load thất bại.

### 6.2. Ranh giới thao tác

Mỗi hành động người dùng sau là một bước: thêm node, sửa node, xóa selection, thêm/sửa/xóa edge, kéo một hoặc nhiều node kèm wire geometry, cut, paste và clear.

Đặc biệt: group drag hiện có thể gửi moveNodes và updateEdges riêng; cut/delete cũng có thể gồm nhiều mutation. Không ghi một history entry cho từng request rồi gọi đó là một lần kéo/cut. Cần batch/transaction ở backend hoặc cơ chế command tương đương để thực hiện và ghi lịch sử nguyên tử. Chọn giải pháp và ghi lại trong tài liệu.

- Validate trước khi commit; lỗi không được để lại nửa graph hay history entry rỗng.
- Mutation không thay đổi dữ liệu không tạo entry.
- Undo rồi edit mới xóa nhánh redo; thao tác lỗi không xóa redo.
- Undo/Redo giữ nguyên định danh project và không sinh ID trùng cho lần edit tiếp theo.
- Chặn thao tác undo/redo chồng lên command đang pending; pin project ID để không sửa nhầm project vừa chuyển.
- Giữ `Store.Mu` khi thay đổi graph/history; không giữ lock trong filesystem hoặc Python IO.

### 6.3. API và đồng bộ frontend

Thêm API trạng thái history và Undo/Redo theo cách mount route hiện tại. Gợi ý `/api/canvas/history`, `/api/canvas/history/undo`, `/api/canvas/history/redo`; mutation dùng POST, kèm project ID. Nếu thêm legacy alias, duy trì nhất quán với `RegisterAPI`/`RegisterRoutes` và có test.

Response phải đủ để frontend biết project, graph sau restore, canUndo/canRedo và nhãn thao tác nếu dùng. Quy định rõ status/error khi project không tồn tại hoặc history trống, tránh panic và tránh sửa project khác.

Sau Undo/Redo:

1. Cập nhật graph theo snapshot server thành công, tránh tự dựng trạng thái lạc với backend.
2. Bảo toàn zoom/pan, dọn selection ID không còn tồn tại, đồng bộ toolbar và history state.
3. Hủy/bỏ qua kết quả fetch/shape analysis cũ. Kiểm tra cả guard frontend trong `api/shapeRefresh.js` và guard backend trong `graph/snapshot.go`.
4. Nếu cần revision, dùng revision tăng đơn điệu; không restore revision cũ từ snapshot. Test tình huống edit → undo → redo khi inference cũ trả muộn.
5. Refresh shape khi thay đổi semantic; không bắt người dùng chờ Python chỉ để thấy kết quả Undo/Redo. Layout-only restore không cần inference vô ích.

## 7. Mode và phạm vi màn hình mới

- Menu chính xác theo thứ tự Canvas, Data, Debug, Code; bỏ Train khỏi registry ứng dụng chính của đợt này.
- Tiếp tục dùng `/api/modes` làm nguồn điều hướng, không duy trì thêm danh sách hardcode lệch registry.
- Canvas là mode mặc định, giữ chức năng thực tế hiện tại.
- Data/Debug/Code có route truy cập được và màn hình khung ghi rõ tính năng đang phát triển. Đây là shell điều hướng, không được báo là đã có data editor/debugger/code editor hoàn chỉnh.
- Mọi màn hình có menu dùng chung, trạng thái mode hiện tại đúng và có đường quay về Canvas.
- Giữ studio độc lập với implementation từng mode: composition root đăng ký descriptor; không nhét logic Canvas vào studio router.
- Đổi mode tiếp tục điều hướng trang phù hợp kiến trúc hiện tại. Chờ command pending hoàn tất hoặc báo lỗi trước khi rời trang; không đánh rơi mutation chưa gửi xong.
- Quay về Canvas phải giữ graph chưa save, active project, workspace, history trong cùng phiên server. Lưu/khôi phục zoom/pan theo project trong sessionStorage hoặc cơ chế phù hợp.
- Khi mở trực tiếp `/data`, `/debug`, `/code`, trang phải hoạt động và menu không phụ thuộc Canvas từng được mở trước đó.
- Standalone Canvas tiếp tục chạy; registry standalone có thể chỉ có Canvas. Không thêm link chết tới mode chưa đăng ký trong server standalone.

## 8. Bản đồ file dự kiến

Mọi đường dẫn trong bảng tính từ repo root. File mới là gợi ý; agent có thể điều chỉnh nếu giải thích được ownership và tránh duplication.

| Khu vực | File/thư mục | Công việc |
| --- | --- | --- |
| Composition | `src/main.go`, `src/Canvas/canvas.go` | Đăng ký mode, giữ standalone |
| Shared routing/render | `src/studio/routes.go`, `src/studio/render.go` | Chỉ sửa khi cần hỗ trợ shell/render chung |
| Shared template | `src/templates/`, `src/utils/templates/` | Menu/shell dùng chung và cách compose an toàn |
| Canvas pages | `src/Canvas/templates/studio.html`, `canvas.html`, các `header.html`, `workspace.html`, `src/Canvas/handler/page_handlers.go` | Thay header, di chuyển control |
| Shared menu JS | Thêm `src/static/studio/menubar.js`; sửa `navigation.js` | Dropdown, keyboard, mode registry, command adapter |
| CSS | `src/static/styles/header.css`, `file-menu.css`, `modes.css`, `workspace.css`, `folder-browser.css`, `src/static/style.css` | Style và responsive |
| Workspace | `src/Canvas/static/js/workspace/{browser,menu,sidebar,models}.js`, folder-browser templates | Chọn folder, trạng thái, save, loại listener cũ trùng |
| Frontend commands | `src/Canvas/static/js/application/`, `clipboard/`, thêm module history | Init, command binding, shortcut, trạng thái |
| Graph history | `src/Canvas/utils/graph/` | History per project, snapshot/restore, batch và revision |
| HTTP | `src/Canvas/handler/routes.go`, node/edge/graph/project/model handlers, thêm history handler | Mutation/history nguyên tử, API và validation |
| API client | `src/Canvas/static/js/api.js`, `api/`, `graph/dragging.js`, `contextMenu/deletion.js` | Gọi batch/history, chống kết quả cũ |
| Mode shells | Package/template mới theo convention repo | Màn hình Data/Debug/Code |
| Tests/docs | Các test và `document.md` liên quan | Cập nhật contract và kiểm chứng hành vi |

Lưu ý: `ComposeTemplate` hiện chỉ chấp nhận include local bên trong owner, chặn `..`. Không dùng include `../../templates/...` để chia sẻ menu. Nếu mở rộng composer, dùng mapping/root được tin cậy hoặc composition tường minh, giữ bảo vệ traversal/cycle, compose xong mới ghi HTTP response, thêm test lỗi. Không bỏ chặn path để đạt reuse.

## 9. Trình tự làm việc

1. Đọc tài liệu/code liên quan, xem diff và chạy các test liên quan làm baseline. Ghi lỗi có sẵn riêng.
2. Tạo menu chung, style, tương tác keyboard và đưa control Canvas về đúng vị trí. Kiểm tra cả hai page variant.
3. Chuẩn hóa File/folder, reuse API hiện có, hỗ trợ shared shell.
4. Nối Edit với clipboard và trạng thái command.
5. Làm history backend và test trước; sau đó batch các thao tác nhiều request, nối API/frontend và shape guards.
6. Đăng ký 4 mode, tạo màn hình khung, bảo toàn state khi chuyển trang.
7. Chạy kiểm thử tích hợp, kiểm tra browser trực tiếp, sửa regression, cập nhật tài liệu.
8. Báo cáo file đã đổi, hành vi đạt được, test thực chạy và giới hạn còn lại.

Không tự thêm dependency lớn hoặc viết lại kiến trúc editor. Không xóa/ghi đè model của người dùng để test; dùng temporary workspace và graph mẫu.

## 10. Kiểm thử tự động

### 10.1. Go

Từ `src`:

```powershell
go test ./...
go vet ./...
```

Thêm test thực chất cho:

- History round-trip mỗi loại mutation; deep-copy params và nested graph không alias.
- Khôi phục geometry/order/counters/parent đúng, ID mới không collision.
- Multi-node drag và cut là một entry; lỗi giữa batch không commit một phần.
- No-op, history trống, giới hạn 100 entry, invalid project, branch redo, hai project độc lập.
- Load thành công reset baseline đúng; load lỗi không đổi history.
- Undo/Redo trong khi inference cũ trả về, bao gồm chuỗi A → B → A.
- Route shell, mode order ở cấu hình app chính, registry generic, GET/HEAD page, static assets, standalone và legacy Canvas API.
- Nếu sửa composer: include chung thành công, cycle/missing/path traversal bị từ chối, không trả page dở dang.

Chạy race tests cho package bị ảnh hưởng concurrency nếu CGO/compiler hỗ trợ; ghi rõ nếu môi trường không chạy được. Không coi test skip vì thiếu Python/PyTorch là đã kiểm tra inference.

### 10.2. JavaScript

Từ repo root:

```powershell
node src/static/studio/navigation.test.mjs
node src/Canvas/static/js/ui.test.mjs
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/performance.test.mjs
```

Bổ sung test theo convention `.test.mjs` cho menu/history/command state, rồi chạy chúng. Test cần kiểm tra hành vi chứ không chỉ so sánh chuỗi HTML/CSS:

- Một dropdown mở; Escape/outside click/keyboard đúng; focus được trả lại.
- Command disabled không gọi mutation; event listener không bị nhân đôi.
- Shortcut trong text editor/dialog không tác động graph.
- History API lỗi không cập nhật UI thành công; project mismatch/stale response bị bỏ qua.
- Mode list và destination lấy từ registry; active item đúng; lỗi registry có phản hồi phù hợp.
- Các inline handler còn trong template phải tồn tại. Repo có test ghi nhận handler connection chưa implement từ trước; không che lỗi mới bằng cách thêm tùy tiện vào allowlist.

## 11. Kiểm tra browser và visual

Khởi chạy `go run .` từ `src`, mở URL server được báo. Nếu port đang dùng, chọn port khác thay vì dừng process không rõ chủ sở hữu. Dùng browser tool nếu có; tuân thủ skill/tool tương ứng.

| Nhóm | Case cần kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| Layout | 1440, 1024, 768px; zoom 125–150% | Menu gọn, không overlap/cắt dropdown; chữ đọc được |
| Nội dung dài | Tên model/folder dài, Unicode, khoảng trắng | Không đẩy menu vỡ layout; xem được path đầy đủ |
| Menu | Chuột và bàn phím, click liên tục, Escape | Mở/đóng đúng, focus rõ, không trigger graph ngoài ý muốn |
| Workspace | Chưa chọn, chọn, cancel, path lỗi, native picker | Cập nhật đúng, lỗi thử lại được, cancel giữ nguyên |
| Folder model | Click dòng, double click, Load model | Chọn/duyệt/load phân biệt rõ |
| Edit | Copy/Cut/Paste nhiều node có dây | Đúng selection, clipboard, geometry, trạng thái menu |
| History | Add → drag → edit → cut → undo/redo | Mỗi bước phục hồi đúng; drag/cut một bước |
| Branch | Undo rồi thêm node mới | Redo disabled; không còn nhánh cũ |
| Mode | Canvas → Data → Debug → Code → Canvas | Route đúng; shell trung thực; graph/history/view còn nguyên |
| Regression | Rename, save/load, nối dây, Fit View, clear | Control còn dùng được sau di chuyển |
| Direct entry | `/`, `/canvas`, `/data`, `/debug`, `/code` | Không cần mở Canvas trước; menu đúng |
| Standalone | Chạy entry point Canvas riêng | Canvas hoạt động, không link chết |

Luồng nghiệm thu cuối: Open Folder → tạo vài node và dây → kéo nhóm → Cut → Undo → Redo → Undo → đổi mode → quay về Canvas → Save → load lại và so sánh graph. Kiểm tra console/network không có lỗi mới. Native picker cần test thực trên Windows; nếu môi trường không thao tác được phải ghi rõ chưa xác minh.

## 12. Definition of done

- [ ] Có thanh `EinTheater File Edit Mode` elegant, gọn; không còn mode strip trùng phía trên.
- [ ] File chọn workspace thật, cancel/error đúng và dùng được từ các mode shell.
- [ ] Edit có clipboard và Undo/Redo hoạt động thực, disabled/shortcut đúng ngữ cảnh.
- [ ] History server theo project, batch nguyên tử và không bị inference cũ ghi đè.
- [ ] Mode đúng Canvas/Data/Debug/Code; các shell ghi rõ giới hạn chức năng.
- [ ] Quay lại Canvas giữ graph, active project, workspace, history và zoom/pan trong phiên.
- [ ] Hai Canvas page variant và standalone không regression.
- [ ] Test liên quan đã chạy; browser/visual đã kiểm tra hoặc ghi rõ phần bị chặn.
- [ ] Tài liệu contract và hành vi được cập nhật.
- [ ] Báo cáo cuối phân biệt rõ đã triển khai, đã test, test skip/chưa chạy và lỗi có sẵn.

Không tuyên bố hoàn thành nếu chỉ thêm menu nhưng Undo/Redo chưa có, mode vẫn là nút chết, hoặc chưa xác minh việc giữ graph khi chuyển mode. Khi gặp giới hạn môi trường, hoàn thành phần độc lập còn lại và nêu bằng chứng cụ thể về phần chưa kiểm chứng.
