# Third-party notices

Planet Creator's own code is MIT licensed (see [LICENSE](LICENSE)). The components and marks below are not covered by
that grant: they keep their own licenses and terms.

## Code

| Component | Files | License |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js/tree/r186) r186, with its OrbitControls add-on | `apps/planet/vendor/three/build/three.module.js`, `apps/planet/vendor/three/build/three.core.js`, `apps/planet/vendor/three/examples/jsm/controls/OrbitControls.js` | MIT, Copyright © 2010-2026 three.js authors: [apps/planet/vendor/three/LICENSE](apps/planet/vendor/three/LICENSE) |
| [fit-file-parser](https://github.com/jimmykane/fit-parser) 5.0.2 | `apps/planet/vendor/fit/fit-parser.js` (one minified bundle) | MIT, Copyright (c) 2015 Pierre Jacquier: [apps/planet/vendor/fit/LICENSE](apps/planet/vendor/fit/LICENSE) |
| [buffer](https://github.com/feross/buffer) 6.0.3, [base64-js](https://github.com/beatgammit/base64-js) 1.5.1, [ieee754](https://github.com/feross/ieee754) 1.2.1, bundled into fit-parser.js | `apps/planet/vendor/fit/fit-parser.js` | MIT, MIT and BSD-3-Clause: [texts below](#license-texts) |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) 5.2.2 | `apps/planet-home/lib/mp4-muxer.js` | MIT, Copyright (c) 2023 Vanilagy: in the file's header |

## Marks

- **Strava.** `apps/planet/strava-mark.js` (`poweredSvg`, the "Powered by Strava" logo) and
  `apps/planet-home/lib/strava-import.js` (`CONNECT_SVG`, the "Connect with Strava" button) embed Strava's official
  artwork, unchanged. It is used under the [Strava API Brand Guidelines](https://developers.strava.com/guidelines/)
  and the [Strava API Agreement](https://www.strava.com/legal/api). The Strava name and logos are Strava's
  trademarks and are not licensed under this repo's MIT license; a fork that connects to Strava must follow those
  terms itself. Planet Creator is not developed or sponsored by Strava.
- **Garmin.** "Garmin" and Garmin device model names appear only as text: the "Garmin [device model]" attribution on
  data recorded on Garmin devices, which the
  [Garmin API Brand Guidelines](https://developer.garmin.com/downloads/brand/Garmin-Developer-API-Brand-Guidelines.pdf)
  require. Garmin is a trademark of Garmin Ltd. or its subsidiaries and is not licensed under this repo's MIT
  license. No Garmin artwork is included.

## License texts

### buffer 6.0.3

```
The MIT License (MIT)

Copyright (c) Feross Aboukhadijeh, and other contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### base64-js 1.5.1

```
The MIT License (MIT)

Copyright (c) 2014 Jameson Little

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### ieee754 1.2.1

```
Copyright 2008 Fair Oaks Labs, Inc.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
