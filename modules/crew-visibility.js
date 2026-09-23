// Imported skin meshes have moving bounds. Cull each whole person, including
// workers attached to elevated platforms, before asking Three to draw the rig.
export function createCrewVisibility(THREE) {
  const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
  const center=new THREE.Vector3(),sphere=new THREE.Sphere(center,1.5);
  let origin,maxDistance=55;
  return {
    begin(camera,position,mobile){
      origin=position;maxDistance=mobile?28:55;
      matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(matrix);
    },
    inspect(mesh){
      mesh.updateWorldMatrix(true,false);
      mesh.getWorldPosition(center);
      const distance=Math.hypot(center.x-origin.x,center.z-origin.z);
      center.y+=1;
      return {distance,visible:distance<maxDistance&&frustum.intersectsSphere(sphere)};
    },
  };
}
