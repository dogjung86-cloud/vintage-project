/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY?: string;
    readonly VITE_API_KEY?: string;
    // 더 많은 환경 변수들을 아래에 추가할 수 있습니다.
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
