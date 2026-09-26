/* Load BEFORE vendor/model-viewer/model-viewer.min.js. Points every decoder at vendored,
   same-origin files so the viewer never contacts a CDN. Paths resolve against the page URL. */
(function () {
  var base = new URL('vendor/', document.baseURI).href;
  self.ModelViewerElement = self.ModelViewerElement || {};
  self.ModelViewerElement.ktx2TranscoderLocation = base + 'basis/';   /* KTX2 not used, no files shipped */
  self.ModelViewerElement.meshoptDecoderLocation = base + 'meshopt/meshopt_decoder.js';
  self.ModelViewerElement.lottieLoaderLocation = base + 'lottie/LottieLoader.js'; /* unused */
})();
