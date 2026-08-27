# FieldPilot 서버 정상화본

## 핵심 수정
- `/api/auth/login`, `/api/auth/status`, `/api/auth/logout`를 실제 server.js에 포함
- 인가코드: masterCode + regionCodes
- 지역 사용자는 자기 지역만 서버에서 허용
- master만 전체 지역 허용
- CORS OPTIONS/Authorization/X-FieldPilot-Auth 처리
- `/api/health`
- `/api/config/public`
- `/api/weather`
- `/api/route/optimize`
- `/api/proxy/kakaocorp/*`
- 사진 저장 API
- app.js의 OpenWeather 키 하드코딩 제거

## 실행
1. config.json에 실제 키/인가코드를 입력
2. `node server.js`
3. `curl http://127.0.0.1:3000/api/health`
4. cloudflared quick tunnel 실행 후 server-config.js의 URL을 터널 URL로 변경
5. GitHub Pages 새 배포
