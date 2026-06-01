import { createApp } from 'vue';
import { createPinia } from 'pinia';
import StaffApp from './StaffApp.vue';
import './style.css';
import './staff-style.css';

const app = createApp(StaffApp);
app.use(createPinia());
app.mount('#app');
