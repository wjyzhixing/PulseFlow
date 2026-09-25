import { createApp } from 'vue';
import 'ant-design-vue/dist/reset.css';
import './styles/ant-design-theme.css';
import App from './App.vue';
import { createStudioRouter } from './router';
createApp(App).use(createStudioRouter()).mount('#app');
