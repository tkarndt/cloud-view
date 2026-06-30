1. Do this task https://github.com/cyclomedia/tech-interview-task/blob/main/ProductEngineerTask.md
Use python for the Real-time sync layer. Show me the implementation plan first.
2. loading the SoFi Stadium COPC file takes long. Adapt the frontend to show the progress of loading the file.
3. potree is not setup correctly. with error message: cp: cannot create directory '/home/alex/cloud-view/frontend/public/potree/build/potree': No such file or directory
4. there are a few error messages like GET
  http://localhost:5173/potree/libs/spectrum/spectrum.min.js
  [HTTP/1.1 404 Not Found 9ms]
5. fix this Uncaught (in promise) TypeError: window.Copc is undefined
      load EptLoader.js:24
      promise Potree.js:153
      loadPointCloud$1 Potree.js:137
      init main.ts:86
      <anonymous> main.ts:109
  EptLoader.js:24:28
6. in potree the view has the position and direction properties which are also used to update the peers visual. Using position and target as a data model is the wrong choice. Adapt all interfaces in backend and frontend to use position and direction instead