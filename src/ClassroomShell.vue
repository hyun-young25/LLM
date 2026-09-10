<script setup>
import { ref, computed, provide, onMounted, onUnmounted } from 'vue';
import App from './App.vue';
import AdminDashboard from './AdminDashboard.vue';
import { classroomKey, createClassroomClient, classroomApi } from './classroomClient.js';
const classroom=createClassroomClient(); provide(classroomKey,classroom);
const checking=ref(true), unavailable=ref(false), busy=ref(false), error=ref(''), panel=ref(location.hash==='#admin'?'admin':'student'), showLogin=ref(location.hash==='#login');
const form=ref({name:'',studentId:'',password:'',login:'instructor'});
const remoteUrl=import.meta.env.VITE_CLASSROOM_URL || '';
const validRemote=computed(()=>{try { const url=new URL(remoteUrl); return url.protocol==='https:' ? url.origin : ''; } catch { return ''; }});
const isAdmin=computed(()=>panel.value==='admin');
const needsLogin=computed(()=>!classroom.user && (classroom.enabled || showLogin.value || isAdmin.value));
const statusText=computed(()=>({saving:'기록 저장 중…',pending:'저장 대기 중…',saved:'기록 저장됨',error:'저장 실패 · 다시 시도하세요',conflict:'다른 창의 기록과 충돌했습니다'})[classroom.status] || '활동하면 기록이 저장됩니다');
async function restore(user) {
  const data=user?.role==='student'?await classroomApi('/progress'):{};
  classroom.load(user,data);
}
async function check() {
  checking.value=true; error.value='';
  try { const health=await classroomApi('/health'); classroom.enabled=health.enabled===true; unavailable.value=false; const data=await classroomApi('/session'); await restore(data.user); }
  catch(e) { unavailable.value=true; classroom.enabled=false; }
  finally { checking.value=false; }
}
async function login() {
  busy.value=true; error.value='';
  try { const credentials=isAdmin.value?{login:form.value.login,password:form.value.password}:{name:form.value.name,studentId:form.value.studentId}; const result=await classroomApi(isAdmin.value?'/admin-login':'/login',credentials); await restore(result.user); form.value.password=''; showLogin.value=false; location.hash=result.user.role==='admin'?'admin':'learn'; }
  catch(e) { error.value=e.message; } finally { busy.value=false; }
}
async function logout() {
  busy.value=true; error.value='';
  try { if(!await classroom.flush()) throw new Error('아직 저장되지 않은 기록이 있습니다. 저장을 다시 시도한 뒤 로그아웃하세요.'); await classroomApi('/logout',{}); classroom.load(null); location.hash='login'; }
  catch(e) { error.value=e.message; } finally { busy.value=false; }
}
function reload() { window.location.reload(); }
function route() { panel.value=location.hash==='#admin'?'admin':'student'; showLogin.value=location.hash==='#login'; }
function beforeUnload(event) { if(classroom.hasPending()) { event.preventDefault(); event.returnValue=''; } }
function visibility() { if(document.visibilityState==='hidden') classroom.flush(); }
onMounted(()=>{ check(); window.addEventListener('hashchange',route); window.addEventListener('beforeunload',beforeUnload); document.addEventListener('visibilitychange',visibility); });
onUnmounted(()=>{classroom.dispose(); window.removeEventListener('hashchange',route); window.removeEventListener('beforeunload',beforeUnload); document.removeEventListener('visibilitychange',visibility);});
</script>
<template>
  <div class="classroom-shell">
    <header class="classroom-bar"><a href="#learn" class="classroom-brand">GPT 학습실</a><nav aria-label="계정 메뉴"><template v-if="classroom.user"><span>{{ classroom.user.name }}<small v-if="classroom.user.role==='student'"> · {{ classroom.user.studentId }}</small></span><a v-if="classroom.user.role==='admin'" href="#admin">관리자</a><button :disabled="busy" @click="logout">로그아웃</button></template><template v-else><a href="#login">학생 로그인</a><a href="#admin">관리자</a></template></nav></header>
    <p v-if="checking" class="classroom-notice" role="status">학습 기록 연결 확인 중…</p>
    <template v-else>
      <div v-if="classroom.user?.role==='student'" class="classroom-save" :class="{failed:classroom.error}" role="status"><span>{{ statusText }}</span><small v-if="classroom.updatedAt">최근 저장 {{ new Date(classroom.updatedAt).toLocaleTimeString('ko-KR') }}</small><button v-if="classroom.status==='error'" @click="classroom.flush">저장 다시 시도</button><button v-if="classroom.status==='conflict'" @click="reload">최신 기록 불러오기</button><p v-if="classroom.error">{{ classroom.error }} 이 화면을 닫지 말고 저장 상태를 확인하세요.</p></div>
      <p v-if="error && !needsLogin" class="classroom-error" role="alert">{{ error }}</p>
      <section v-if="needsLogin" class="classroom-login">
        <p class="classroom-kicker">{{ isAdmin?'INSTRUCTOR':'STUDENT' }}</p><h1>{{ isAdmin?'학습 기록 관리':'학생 로그인' }}</h1>
        <template v-if="unavailable"><p>현재 주소에서는 학생 기록 서버에 연결할 수 없습니다. 기록 저장은 로그인된 학습실에서만 가능합니다.</p><a v-if="validRemote" class="classroom-primary" :href="validRemote + (isAdmin?'/#admin':'/#login')">{{ isAdmin?'관리자 학습실 열기':'기록되는 학습실 열기' }}</a><template v-else><p>기록 기능을 준비 중입니다. 담당 교수자에게 수업용 접속 주소를 확인해 주세요.</p><button class="classroom-secondary" @click="check">연결 다시 확인</button></template><a href="#learn">공개 체험으로 돌아가기 · 기록 안 됨</a></template>
        <form v-else @submit.prevent="login">
          <p>{{ isAdmin?'관리자 계정으로 학생의 참여 현황과 응답 기록을 확인합니다.':'본인의 이름과 학번을 입력하면 바로 시작합니다. 이름·학번·학습 활동·문항 응답·서술 내용이 저장되며 담당 교수가 확인할 수 있습니다.' }}</p>
          <label v-if="isAdmin">관리자 아이디<input v-model="form.login" autocomplete="username" required maxlength="60" /></label>
          <template v-else><label>이름<input v-model="form.name" autocomplete="name" required maxlength="60" /></label><label>학번<input v-model="form.studentId" autocomplete="username" required minlength="3" maxlength="30" /><small>같은 이름·학번으로 다시 들어오면 이전 학습을 이어갑니다.</small></label></template>
          <label v-if="isAdmin">비밀번호<input v-model="form.password" type="password" autocomplete="current-password" maxlength="128" required /></label>
          <p v-if="error" class="classroom-error" role="alert">{{ error }}</p><button class="classroom-primary" :disabled="busy">{{ busy?'확인 중…':isAdmin?'관리자 로그인':'학습 시작' }}</button>
        </form>
      </section>
      <AdminDashboard v-else-if="isAdmin && classroom.user?.role==='admin'" />
      <section v-else-if="isAdmin" class="classroom-login"><h1>관리자 전용 페이지입니다</h1><p>학생 계정에서는 다른 학생의 기록을 볼 수 없습니다.</p><a href="#learn">내 학습으로 돌아가기</a></section>
      <template v-else><div v-if="!classroom.enabled" class="classroom-notice">공개 체험 · 이 화면의 활동은 학생 기록에 저장되지 않습니다. <a v-if="validRemote" :href="validRemote+'/#login'">기록되는 학습실로 이동</a></div><App :key="classroom.user?.id || 'guest'" /></template>
    </template>
  </div>
</template>
<style src="./classroom.css"></style>
