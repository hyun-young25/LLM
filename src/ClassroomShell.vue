<script setup>
import { ref, computed, provide, onMounted, onUnmounted } from 'vue';
import App from './App.vue';
import AdminDashboard from './AdminDashboard.vue';
import { classroomKey, createClassroomClient, classroomApi } from './classroomClient.js';
const classroom=createClassroomClient(); provide(classroomKey,classroom);
const checking=ref(true), unavailable=ref(false), busy=ref(false), error=ref(''), panel=ref(location.hash==='#admin'?'admin':'student'), showLogin=ref(location.hash==='#login'), activation=ref(false);
const form=ref({name:'',studentId:'',password:'',joinCode:'',login:'instructor'});
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
  try { const result=await classroomApi(isAdmin.value?'/admin-login':activation.value?'/activate':'/login',form.value); await restore(result.user); form.value.password=''; form.value.joinCode=''; showLogin.value=false; location.hash=result.user.role==='admin'?'admin':'learn'; }
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
        <p class="classroom-kicker">{{ isAdmin?'INSTRUCTOR':'STUDENT' }}</p><h1>{{ isAdmin?'학습 기록 관리':activation?'첫 수업 참여 등록':'학생 로그인' }}</h1>
        <template v-if="unavailable"><p>현재 주소에서는 학생 기록 서버에 연결할 수 없습니다. 기록 저장은 로그인된 학습실에서만 가능합니다.</p><a v-if="validRemote" class="classroom-primary" :href="validRemote + (isAdmin?'/#admin':'/#login')">{{ isAdmin?'관리자 학습실 열기':'기록되는 학습실 열기' }}</a><template v-else><p>기록 기능을 준비 중입니다. 담당 교수자에게 수업용 접속 주소를 확인해 주세요.</p><button class="classroom-secondary" @click="check">연결 다시 확인</button></template><a href="#learn">공개 체험으로 돌아가기 · 기록 안 됨</a></template>
        <form v-else @submit.prevent="login">
          <p>{{ isAdmin?'관리자 계정으로 학생의 참여 현황과 응답 기록을 확인합니다.':'이름·학번·학습 활동·문항 응답·서술 내용이 저장되며 담당 교수가 확인할 수 있습니다.' }}</p>
          <label v-if="isAdmin">관리자 아이디<input v-model="form.login" autocomplete="username" required maxlength="60" /></label>
          <template v-else><label>이름<input v-model="form.name" autocomplete="name" required maxlength="60" /></label><label>학번<input v-model="form.studentId" autocomplete="username" required maxlength="30" /></label></template>
          <label>비밀번호<input v-model="form.password" type="password" :autocomplete="activation?'new-password':'current-password'" :minlength="activation?10:undefined" maxlength="128" required /><small v-if="activation">다시 로그인할 때 사용할 10자 이상의 비밀번호</small></label>
          <label v-if="activation && !isAdmin">수업 참여 코드<input v-model="form.joinCode" autocomplete="off" required maxlength="100" /><small>교수자가 등록한 명단의 이름·학번과 참여 코드가 필요합니다.</small></label>
          <p v-if="error" class="classroom-error" role="alert">{{ error }}</p><button class="classroom-primary" :disabled="busy">{{ busy?'확인 중…':activation&&!isAdmin?'등록하고 학습 시작':'로그인' }}</button>
          <button v-if="!isAdmin" type="button" class="classroom-text" @click="activation=!activation;error=''">{{ activation?'이미 등록했어요 · 로그인':'처음 참여하나요? · 비밀번호 등록' }}</button>
        </form>
      </section>
      <AdminDashboard v-else-if="isAdmin && classroom.user?.role==='admin'" />
      <section v-else-if="isAdmin" class="classroom-login"><h1>관리자 전용 페이지입니다</h1><p>학생 계정에서는 다른 학생의 기록을 볼 수 없습니다.</p><a href="#learn">내 학습으로 돌아가기</a></section>
      <template v-else><div v-if="!classroom.enabled" class="classroom-notice">공개 체험 · 이 화면의 활동은 학생 기록에 저장되지 않습니다. <a v-if="validRemote" :href="validRemote+'/#login'">기록되는 학습실로 이동</a></div><App :key="classroom.user?.id || 'guest'" /></template>
    </template>
  </div>
</template>
<style src="./classroom.css"></style>
