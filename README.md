# Auto Hex Editor for VS Code

자동으로 확장자 없는 파일을 VS Code의 내장 Hex Editor로 여는 확장입니다.

## 기능

- 확장자가 없는 파일을 열 때 자동으로 Hex Editor로 전환
- 설정을 통해 기능 활성화/비활성화 가능

## 설치 방법

### 개발 모드로 실행
1. 이 저장소를 클론합니다
2. `npm install`을 실행하여 의존성을 설치합니다
3. VS Code에서 이 폴더를 엽니다
4. `F5`를 눌러 Extension Development Host에서 테스트합니다

### 빌드 및 설치
1. `npm install -g vsce` (처음 한 번만)
2. `vsce package`를 실행하여 `.vsix` 파일 생성
3. VS Code에서 Extensions 뷰를 열고 `...` 메뉴에서 "Install from VSIX..."를 선택하여 설치

## 설정

- `autoHexEditor.enabled`: 자동 Hex Editor 기능 활성화 (기본값: true)

## 사용 방법

확장자가 없는 파일을 열면 자동으로 Hex Editor로 열립니다.

## 라이선스

MIT# vscode-thru-hex-editor
