import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Large-Waste-Estimate/', // GitHub Pages 레포지토리 이름과 동일하게 설정
})
