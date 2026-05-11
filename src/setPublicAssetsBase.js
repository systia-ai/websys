// GitHub Pages sirve bajo /websys/; import.meta.env.BASE_URL lo refleja en build.
document.documentElement.style.setProperty(
  '--bg-home-repair',
  `url('${import.meta.env.BASE_URL}assets/home-repair-bg.png')`,
)
