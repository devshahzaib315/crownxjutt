document.documentElement.classList.add('js-ready');
let THREE = null;
try {
  THREE = await import('three');
} catch (error) {
  console.warn('Three.js did not load; the CSS visual fallback will be used.', error);
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isFinePointer = window.matchMedia('(pointer: fine)').matches;

/* ------------------------- Intro / preloader ------------------------- */
const preloader = document.querySelector('#preloader');
const loadNumber = document.querySelector('#loadNumber');
const loadTrack = document.querySelector('#loadTrack');
let loadValue = 0;
const loaderTimer = window.setInterval(() => {
  loadValue = Math.min(100, loadValue + Math.ceil(Math.random() * 13));
  if (loadNumber) loadNumber.textContent = String(loadValue).padStart(2, '0');
  if (loadTrack) loadTrack.style.width = `${loadValue}%`;
  if (loadValue >= 100) {
    window.clearInterval(loaderTimer);
    window.setTimeout(() => preloader?.classList.add('is-done'), 260);
  }
}, 75);
window.addEventListener('load', () => {
  window.setTimeout(() => {
    if (loadNumber) loadNumber.textContent = '100';
    if (loadTrack) loadTrack.style.width = '100%';
    preloader?.classList.add('is-done');
    window.clearInterval(loaderTimer);
  }, 450);
}, { once: true });

/* -------------------------- Three.js hero ---------------------------- */
const canvas = document.querySelector('#heroCanvas');
const heroArt = document.querySelector('#heroArt');
let renderer;
let scene;
let camera;
let core;
let coreMaterial;
let innerKnot;
let orbitGroup;
let particleField;
let animationFrame = 0;
let canvasInView = true;
let pointerX = 0;
let pointerY = 0;
let smoothX = 0;
let smoothY = 0;

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplace;

  void main() {
    float waveA = sin(position.x * 3.7 + uTime * 0.52) * cos(position.y * 4.3 - uTime * 0.43);
    float waveB = sin(position.z * 5.1 - uTime * 0.36 + position.x * 2.2);
    float waveC = cos(position.y * 7.0 + position.z * 2.8 + uTime * 0.21);
    float displacement = waveA * 0.075 + waveB * 0.045 + waveC * 0.018;
    vec3 transformed = position + normal * displacement;
    vDisplace = displacement;
    vNormal = normalize(normalMatrix * normal);
    vPosition = transformed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplace;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(vPosition, 1.0)).xyz);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.6);
    float lightA = max(dot(normal, normalize(vec3(-0.45, 0.7, 0.9))), 0.0);
    float lightB = max(dot(normal, normalize(vec3(0.8, -0.35, 0.25))), 0.0);
    float bands = 0.5 + 0.5 * sin(vPosition.y * 5.6 + vPosition.x * 2.1 + uTime * 0.48);
    vec3 deep = vec3(0.012, 0.035, 0.085);
    vec3 violet = vec3(0.08, 0.27, 0.52);
    vec3 pearl = vec3(0.78, 0.91, 1.0);
    vec3 acid = vec3(0.20, 0.67, 1.0);
    vec3 color = mix(deep, violet, smoothstep(-1.1, 1.15, vPosition.y + bands * 0.12));
    color = mix(color, pearl, pow(lightA, 5.0) * 0.5);
    color = mix(color, acid, fresnel * 0.76 + pow(max(vDisplace, 0.0), 1.5) * 0.25);
    color += vec3(0.12, 0.36, 0.72) * lightB * 0.2;
    color += acid * (0.035 + 0.055 * bands);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeParticleField(count = 1150) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const radius = 2.7 + Math.random() * 4.8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi) * 0.7;
    sizes[i] = 0.7 + Math.random() * 1.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.PointsMaterial({
    color: 0xbdeaff,
    size: 0.018,
    transparent: true,
    opacity: 0.68,
    sizeAttenuation: true,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

function initThree() {
  if (!THREE || !canvas || !heroArt || !window.WebGLRenderingContext) {
    heroArt?.classList.add('no-webgl');
    return;
  }

  try {
    const width = Math.max(heroArt.clientWidth, 1);
    const height = Math.max(heroArt.clientHeight, 1);
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setClearColor(0x050b18, 0);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050b18, 0.035);
    camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 60);
    camera.position.set(0, 0, 7.65);

    scene.add(new THREE.AmbientLight(0xc6b8df, 0.9));
    const limeLight = new THREE.PointLight(0x57bdff, 35, 13, 1.8);
    limeLight.position.set(3.6, 2.8, 3.5);
    scene.add(limeLight);
    const violetLight = new THREE.PointLight(0x2e65c4, 46, 14, 1.8);
    violetLight.position.set(-3.5, -1.8, 2.2);
    scene.add(violetLight);
    const topLight = new THREE.DirectionalLight(0xeaf6ff, 2.0);
    topLight.position.set(-2.2, 4.0, 2.8);
    scene.add(topLight);

    const world = new THREE.Group();
    scene.add(world);

    // A custom deformed shader surface is the centrepiece of the scene.
    const coreGeometry = new THREE.IcosahedronGeometry(1.52, 6);
    coreMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader,
      fragmentShader,
      transparent: false,
      side: THREE.FrontSide,
    });
    core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.rotation.set(0.3, 0.35, -0.2);
    world.add(core);

    // Fine wire shell gives the surface a technical, crafted edge.
    const shellGeometry = new THREE.IcosahedronGeometry(1.66, 2);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: 0x57bdff,
      wireframe: true,
      transparent: true,
      opacity: 0.105,
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.rotation.set(0.2, -0.25, 0.4);
    world.add(shell);

    // Liquid metal knot living inside the outer form.
    const knotGeometry = new THREE.TorusKnotGeometry(0.72, 0.105, 190, 24, 2, 5);
    const knotMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc2e3ff,
      metalness: 0.82,
      roughness: 0.19,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      emissive: 0x0a2442,
      emissiveIntensity: 0.52,
    });
    innerKnot = new THREE.Mesh(knotGeometry, knotMaterial);
    innerKnot.scale.setScalar(0.78);
    innerKnot.rotation.set(0.5, -0.2, 0.4);
    world.add(innerKnot);

    // Orbit cage: offset elliptical rings with small marker objects.
    orbitGroup = new THREE.Group();
    const orbitConfigs = [
      { radius: 2.02, tube: 0.008, color: 0x57bdff, opacity: 0.72, rotation: [1.08, 0.32, 0.1] },
      { radius: 2.26, tube: 0.006, color: 0x5b9fe2, opacity: 0.62, rotation: [0.2, 1.15, 0.76] },
      { radius: 1.82, tube: 0.005, color: 0xf0eadb, opacity: 0.3, rotation: [1.55, 0.3, -0.5] },
    ];
    orbitConfigs.forEach((config, index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(config.radius, config.tube, 8, 220),
        new THREE.MeshBasicMaterial({ color: config.color, transparent: true, opacity: config.opacity }),
      );
      ring.rotation.set(...config.rotation);
      orbitGroup.add(ring);
      if (index < 2) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(index === 0 ? 0.045 : 0.032, 18, 18),
          new THREE.MeshBasicMaterial({ color: config.color }),
        );
        marker.position.set(config.radius, 0, 0);
        ring.add(marker);
      }
    });
    world.add(orbitGroup);

    particleField = makeParticleField(window.innerWidth < 680 ? 580 : 1150);
    scene.add(particleField);

    const clock = new THREE.Clock();
    const render = () => {
      animationFrame = window.requestAnimationFrame(render);
      if (!canvasInView || document.hidden) return;

      const elapsed = clock.getElapsedTime();
      smoothX += (pointerX - smoothX) * 0.035;
      smoothY += (pointerY - smoothY) * 0.035;
      const motionFactor = reduceMotion ? 0.12 : 1;

      coreMaterial.uniforms.uTime.value = elapsed * motionFactor;
      core.rotation.y = elapsed * 0.12 * motionFactor + smoothX * 0.18;
      core.rotation.x = 0.25 + Math.sin(elapsed * 0.25) * 0.09 * motionFactor + smoothY * 0.12;
      core.position.y = Math.sin(elapsed * 0.5) * 0.075 * motionFactor;
      shell.rotation.y = -elapsed * 0.045 * motionFactor + smoothX * 0.08;
      shell.rotation.x = Math.sin(elapsed * 0.2) * 0.08;
      innerKnot.rotation.x = 0.45 + elapsed * 0.16 * motionFactor;
      innerKnot.rotation.y = -0.2 + elapsed * 0.1 * motionFactor;
      orbitGroup.rotation.y = -elapsed * 0.07 * motionFactor + smoothX * 0.05;
      orbitGroup.rotation.x = Math.sin(elapsed * 0.19) * 0.08 * motionFactor + smoothY * 0.05;
      world.rotation.z = smoothX * 0.045;
      particleField.rotation.y = elapsed * 0.009 * motionFactor;
      particleField.rotation.x = Math.sin(elapsed * 0.1) * 0.04;
      renderer.render(scene, camera);
    };
    render();
    heroArt.classList.add('webgl-ready');

    heroArt.addEventListener('pointermove', (event) => {
      if (!isFinePointer) return;
      const rect = heroArt.getBoundingClientRect();
      pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    }, { passive: true });
    heroArt.addEventListener('pointerleave', () => {
      pointerX = 0;
      pointerY = 0;
    }, { passive: true });

    const resizeObserver = new ResizeObserver(() => resizeThree());
    resizeObserver.observe(heroArt);
    const viewObserver = new IntersectionObserver((entries) => {
      canvasInView = entries.some((entry) => entry.isIntersecting);
    }, { threshold: 0.01 });
    viewObserver.observe(heroArt);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else if (!document.hidden && animationFrame === 0) {
        render();
      }
    });
  } catch (error) {
    console.warn('WebGL scene could not initialise. Using the CSS fallback.', error);
    heroArt.classList.add('no-webgl');
    if (renderer) renderer.dispose();
  }
}

function resizeThree() {
  if (!renderer || !camera || !heroArt) return;
  const width = Math.max(heroArt.clientWidth, 1);
  const height = Math.max(heroArt.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
}

initThree();

/* --------------------- Scroll reveal + progress --------------------- */
const revealItems = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const scrollProgress = document.querySelector('#scrollProgress');
let scrollTicking = false;
function updateScrollProgress() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
  if (scrollProgress) scrollProgress.style.width = `${progress}%`;
  scrollTicking = false;
}
window.addEventListener('scroll', () => {
  if (!scrollTicking) {
    window.requestAnimationFrame(updateScrollProgress);
    scrollTicking = true;
  }
}, { passive: true });
updateScrollProgress();

/* --------------------------- Mobile menu ---------------------------- */
const menuButton = document.querySelector('#menuButton');
const mobileNav = document.querySelector('#mobileNav');
function closeMenu() {
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Open navigation');
  mobileNav?.classList.remove('open');
  mobileNav?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('menu-open');
}
menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  mobileNav?.classList.toggle('open', isOpen);
  mobileNav?.setAttribute('aria-hidden', String(!isOpen));
  document.body.classList.toggle('menu-open', isOpen);
});
mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

/* ------------------------- Custom cursor ---------------------------- */
const cursor = document.querySelector('#cursor');
if (cursor && isFinePointer) {
  let cursorX = -100;
  let cursorY = -100;
  let targetCursorX = -100;
  let targetCursorY = -100;
  const moveCursor = () => {
    cursorX += (targetCursorX - cursorX) * 0.24;
    cursorY += (targetCursorY - cursorY) * 0.24;
    cursor.style.left = `${cursorX}px`;
    cursor.style.top = `${cursorY}px`;
    window.requestAnimationFrame(moveCursor);
  };
  moveCursor();
  window.addEventListener('pointermove', (event) => {
    targetCursorX = event.clientX;
    targetCursorY = event.clientY;
    cursor.style.opacity = '1';
  }, { passive: true });
  document.querySelectorAll('a, button, .expertise-card, .project').forEach((element) => {
    element.addEventListener('pointerenter', () => cursor.classList.add('is-active'));
    element.addEventListener('pointerleave', () => cursor.classList.remove('is-active'));
  });
}

/* ----------------------- Magnetic interactions ---------------------- */
if (isFinePointer && !reduceMotion) {
  document.querySelectorAll('.magnetic').forEach((element) => {
    element.addEventListener('pointermove', (event) => {
      const rect = element.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      element.style.transform = `translate(${dx * 0.055}px, ${dy * 0.08}px)`;
    });
    element.addEventListener('pointerleave', () => {
      element.style.transform = '';
    });
  });

  // A small 3D tilt on work visuals, restrained to avoid motion sickness.
  document.querySelectorAll('.project').forEach((project) => {
    const visual = project.querySelector('.project-visual');
    if (!visual) return;
    project.addEventListener('pointermove', (event) => {
      const rect = project.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      visual.style.transform = `perspective(1100px) rotateX(${-y * 2.4}deg) rotateY(${x * 2.4}deg)`;
    });
    project.addEventListener('pointerleave', () => {
      visual.style.transform = '';
    });
  });
}

/* Keep a useful first frame visible when JS animations are not needed. */
if (reduceMotion) {
  document.querySelectorAll('.reveal').forEach((item) => item.classList.add('is-visible'));
}
