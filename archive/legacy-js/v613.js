/* Quality Project Control V6.13 — estabilización de Supabase Auth
   - Arranque único después de cargar todos los módulos
   - Evita carreras entre bootstrap y los parches de versiones
   - Login con manejo de timeout, errores y recuperación del botón
   - Fallback seguro para cuentas demo autenticadas cuyo perfil aún no esté enlazado
*/
(function(){
  const AUTH_TIMEOUT_MS = 20000;
  const LOAD_TIMEOUT_MS = 20000;

  function withTimeout(promise, milliseconds, message){
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject)=>{
        timer=setTimeout(()=>reject(new Error(message)), milliseconds);
      })
    ]).finally(()=>clearTimeout(timer));
  }

  function resetToLogin(message=''){
    authenticatedUser=null;
    data=initialData();
    data.users=USERS.map(u=>({...u}));
    ui.view='home';
    render();
    if(message){
      const errorBox=document.getElementById('loginError');
      if(errorBox) errorBox.innerHTML=`<div class="login-error">${escapeHtml(message)}</div>`;
    }
  }

  function resolveAuthenticatedProfile(authUser){
    if(!authUser) return null;
    const authEmail=String(authUser.email||'').trim().toLowerCase();
    let profile=data.users.find(u=>u.authId===authUser.id);
    if(!profile && authEmail){
      profile=data.users.find(u=>String(u.email||'').trim().toLowerCase()===authEmail);
    }
    // Las cuentas demo deben poder entrar aun si el UUID del perfil quedó desactualizado.
    if(!profile && authEmail){
      const fallback=USERS.find(u=>String(u.email||'').trim().toLowerCase()===authEmail);
      if(fallback){
        profile={...fallback,authId:authUser.id,isActive:true};
        data.users.push(profile);
      }
    }
    if(profile && !profile.authId) profile.authId=authUser.id;
    return profile?.isActive===false?null:profile;
  }

  window.login=async function(){
    const emailInput=document.getElementById('loginEmail');
    const passwordInput=document.getElementById('loginPassword');
    const button=document.getElementById('loginBtn');
    const errorBox=document.getElementById('loginError');
    if(!emailInput||!passwordInput||!button) return;

    const email=emailInput.value.trim().toLowerCase();
    const password=passwordInput.value;
    if(errorBox) errorBox.innerHTML='';
    if(!email||!password){
      if(errorBox) errorBox.innerHTML='<div class="login-error">Introduzca el correo y la contraseña.</div>';
      return;
    }

    button.disabled=true;
    button.textContent='Entrando...';
    try{
      // Elimina cualquier sesión local incompleta antes de un inicio manual.
      const current=await withTimeout(supabaseClient.auth.getSession(),AUTH_TIMEOUT_MS,'Supabase no respondió al consultar la sesión.');
      if(current?.data?.session && String(current.data.session.user?.email||'').toLowerCase()!==email){
        await withTimeout(supabaseClient.auth.signOut({scope:'local'}),AUTH_TIMEOUT_MS,'No se pudo limpiar la sesión anterior.');
      }

      const result=await withTimeout(
        supabaseClient.auth.signInWithPassword({email,password}),
        AUTH_TIMEOUT_MS,
        'Supabase tardó demasiado en responder al inicio de sesión.'
      );
      if(result.error) throw result.error;
      const authUser=result.data?.user;
      if(!authUser) throw new Error('Supabase no devolvió el usuario autenticado.');

      await withTimeout(loadRemoteData(),LOAD_TIMEOUT_MS,'Se inició sesión, pero los datos tardaron demasiado en cargar.');
      if(typeof qpcNormalizeState==='function') qpcNormalizeState();

      const profile=resolveAuthenticatedProfile(authUser);
      if(!profile){
        await supabaseClient.auth.signOut({scope:'local'}).catch(()=>{});
        throw new Error('El usuario se autenticó, pero no tiene un perfil activo en la aplicación.');
      }

      authenticatedUser=profile;
      ui.view='home';
      render();
    }catch(error){
      console.error('Fallo de inicio de sesión V6.13:',error);
      const detail=error?.message||String(error)||'Error desconocido';
      if(errorBox) errorBox.innerHTML=`<div class="login-error"><strong>No se pudo iniciar sesión.</strong><br><span>${escapeHtml(detail)}</span></div>`;
    }finally{
      const liveButton=document.getElementById('loginBtn');
      if(liveButton){
        liveButton.disabled=false;
        liveButton.textContent='Entrar';
      }
    }
  };

  window.qpcBootstrapV613=async function(){
    const app=document.getElementById('app');
    if(app) app.innerHTML='<div class="loading-screen">Conectando con Supabase...</div>';
    try{
      const sessionResult=await withTimeout(supabaseClient.auth.getSession(),AUTH_TIMEOUT_MS,'Supabase no respondió al cargar la sesión.');
      if(sessionResult.error) throw sessionResult.error;
      let session=sessionResult.data?.session||null;

      if(session){
        try{
          const refreshed=await withTimeout(supabaseClient.auth.refreshSession(),AUTH_TIMEOUT_MS,'No se pudo renovar la sesión.');
          if(refreshed.error) throw refreshed.error;
          session=refreshed.data?.session||session;
        }catch(refreshError){
          console.warn('Sesión descartada durante el arranque:',refreshError);
          await supabaseClient.auth.signOut({scope:'local'}).catch(()=>{});
          session=null;
        }
      }

      if(!session?.user){
        resetToLogin();
        return;
      }

      await withTimeout(loadRemoteData(),LOAD_TIMEOUT_MS,'No se pudieron cargar los datos desde Supabase.');
      if(typeof qpcNormalizeState==='function') qpcNormalizeState();
      const profile=resolveAuthenticatedProfile(session.user);
      if(!profile){
        await supabaseClient.auth.signOut({scope:'local'}).catch(()=>{});
        resetToLogin('La sesión no tiene un perfil activo. Inicie sesión nuevamente.');
        return;
      }
      authenticatedUser=profile;
      render();
    }catch(error){
      console.error('Fallo de arranque V6.13:',error);
      await supabaseClient.auth.signOut({scope:'local'}).catch(()=>{});
      resetToLogin('No se pudo conectar con Supabase: '+(error?.message||String(error)));
    }
  };

  // V7.0 ejecuta el arranque después de cargar v70.js.
  window.qpcBootstrapV613Ready = true;
})();
