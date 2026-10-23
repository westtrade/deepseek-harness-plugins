import{F}from"./main-zheazd2p.js";import{A,e,f,D,C,B,E,d,I,p,Q,t,T,Ne,Gt,v,nA,b}from"./main-cbwdhkyr.js";import{N}from"./main-4q8m77fd.js";import{gA}from"./main-a8y7cpmc.js";import{vA}from"./main-17ddstnp.js";function at(r,o){return o<r?-1:o>r?1:o>=r?0:NaN}function nt(r){return r}function it(){var r=nt,o=at,R=null,_=T(0),u=T(Ne),x=T(0);function l(a){var i,c=(a=Gt(a)).length,S,L,H=0,y=Array(c),s=Array(c),P=+_.apply(this,arguments),U=Math.min(Ne,Math.max(-Ne,u.apply(this,arguments)-P)),G,Z=Math.min(Math.abs(U)/c,x.apply(this,arguments)),h=Z*(U<0?-1:1),O;for(i=0;i<c;++i)if((O=s[y[i]=i]=+r(a[i],i,a))>0)H+=O;if(o!=null)y.sort(function(j,w){return o(s[j],s[w])});else if(R!=null)y.sort(function(j,w){return R(a[j],a[w])});for(i=0,L=H?(U-c*h)/H:0;i<c;++i,P=G)S=y[i],O=s[S],G=P+(O>0?O*L:0)+h,s[S]={data:a[S],index:i,value:O,startAngle:P,endAngle:G,padAngle:Z};return s}return l.value=function(a){return arguments.length?(r=typeof a==="function"?a:T(+a),l):r},l.sortValues=function(a){return arguments.length?(o=a,R=null,l):o},l.sort=function(a){return arguments.length?(R=a,o=null,l):R},l.startAngle=function(a){return arguments.length?(_=typeof a==="function"?a:T(+a),l):_},l.endAngle=function(a){return arguments.length?(u=typeof a==="function"?a:T(+a),l):u},l.padAngle=function(a){return arguments.length?(x=typeof a==="function"?a:T(+a),l):x},l}var dt=f.pie,ot={sections:new Map,showData:!1,config:dt},{sections:K,showData:lt}=ot,St=structuredClone(dt),yt=A(()=>structuredClone(St),"getConfig"),wt=A(()=>{K=new Map,lt=ot.showData,C()},"clear"),At=A(({label:r,value:o})=>{if(o<0)throw Error(`"${r}" has invalid value: ${o}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);if(!K.has(r))K.set(r,o),e.debug(`added new section: ${r}, with value: ${o}`)},"addSection"),Ct=A(()=>K,"getSections"),$t=A((r)=>{lt=r},"setShowData"),Dt=A(()=>lt,"getShowData"),pt={getConfig:yt,clear:wt,setDiagramTitle:p,getDiagramTitle:Q,setAccTitle:B,getAccTitle:E,setAccDescription:d,getAccDescription:I,addSection:At,getSections:Ct,setShowData:$t,getShowData:Dt},Tt=A((r,o)=>{F(r,o),o.setShowData(r.showData),r.sections.map(o.addSection)},"populateDb"),bt={parse:A(async(r)=>{let o=await N("pie",r);e.debug(o),Tt(o,pt)},"parse")},kt=A((r)=>`
  .pieCircle{
    stroke: ${r.pieStrokeColor};
    stroke-width : ${r.pieStrokeWidth};
    opacity : ${r.pieOpacity};
  }
  .pieCircle.highlighted{
    scale: 1.05;
    opacity: 1;
  }
  .pieCircle.highlightedOnHover:hover{
    transition-duration: 250ms;
    scale: 1.05;
    opacity: 1;
  }
  .pieOuterCircle{
    stroke: ${r.pieOuterStrokeColor};
    stroke-width: ${r.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${r.pieTitleTextSize};
    fill: ${r.pieTitleTextColor};
    font-family: ${r.fontFamily};
  }
  .slice {
    font-family: ${r.fontFamily};
    fill: ${r.pieSectionTextColor};
    font-size:${r.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${r.pieLegendTextColor};
    font-family: ${r.fontFamily};
    font-size: ${r.pieLegendTextSize};
  }
`,"getStyles"),zt=kt,Et=A((r)=>{let o=[...r.values()].reduce((u,x)=>u+x,0),R=[...r.entries()].map(([u,x])=>({label:u,value:x})).filter((u)=>u.value/o*100>=1);return it().value((u)=>u.value).sort(null)(R)},"createPieArcs"),Mt=A((r,o,R,_)=>{e.debug(`rendering pie chart
`+r);let u=_.db,x=t(),l=b(u.getConfig(),x.pie),a=40,i=18,c=4,S=450,L=S,H=v(o),y=H.append("g");y.attr("transform","translate("+L/2+","+S/2+")");let{themeVariables:s}=x,[P]=nA(s.pieOuterStrokeWidth);P??=2;let{legendPosition:U,textPosition:G}=l,Z=l.donutHole>0&&l.donutHole<=0.9?l.donutHole:0,h=Math.min(L,S)/2-a,O=vA().innerRadius(Z*h).outerRadius(h),j=vA().innerRadius(h*G).outerRadius(h*G),w=y.append("g");w.append("circle").attr("cx",0).attr("cy",0).attr("r",h+P/2).attr("class","pieOuterCircle");let q=u.getSections(),ft=Et(q),ht=[s.pie1,s.pie2,s.pie3,s.pie4,s.pie5,s.pie6,s.pie7,s.pie8,s.pie9,s.pie10,s.pie11,s.pie12],Y=0;q.forEach((n)=>{Y+=n});let st=ft.filter((n)=>(n.data.value/Y*100).toFixed(0)!=="0"),tt=gA(ht).domain([...q.keys()]);w.selectAll("mySlices").data(st).enter().append("path").attr("d",O).attr("fill",(n)=>tt(n.data.label)).attr("class",(n)=>{let g="pieCircle";if(l.highlightSlice==="hover")g+=" highlightedOnHover";else if(l.highlightSlice===n.data.label)g+=" highlighted";return g}),w.selectAll("mySlices").data(st).enter().append("text").text((n)=>(n.data.value/Y*100).toFixed(0)+"%").attr("transform",(n)=>"translate("+j.centroid(n)+")").style("text-anchor","middle").attr("class","slice");let mt=y.append("text").text(u.getDiagramTitle()).attr("x",0).attr("y",-(S-50)/2).attr("class","pieTitleText"),X=[...q.entries()].map(([n,g])=>({label:n,value:g})),W=y.selectAll(".legend").data(X).enter().append("g").attr("class","legend");W.append("rect").attr("width",i).attr("height",i).style("fill",(n)=>tt(n.label)).style("stroke",(n)=>tt(n.label)),W.append("text").attr("x",i+c).attr("y",i-c).text((n)=>{if(u.getShowData())return`${n.label} [${n.value}]`;return n.label});let V=Math.max(...W.selectAll("text").nodes().map((n)=>n?.getBoundingClientRect().width??0)),J=S,et=L+a,m=i+c,rt=X.length*m;switch(U){case"center":W.attr("transform",(n,g)=>{let k=m*X.length/2,z=-V/2-(i+c),M=g*m-k;return"translate("+z+","+M+")"});break;case"top":J+=rt,W.attr("transform",(n,g)=>{let k=h,z=-V/2-(i+c),M=g*m-k;return`translate(${z}, ${M})`}),w.attr("transform",()=>`translate(0, ${rt+m})`);break;case"bottom":J+=rt,W.attr("transform",(n,g)=>{let k=-h-m,z=-V/2-(i+c),M=g*m-k;return"translate("+z+","+M+")"});break;case"left":et+=i+c+V,W.attr("transform",(n,g)=>{let k=m*X.length/2,z=-h-(i+c),M=g*m-k;return"translate("+z+","+M+")"}),w.attr("transform",()=>`translate(${V+i+c}, 0)`);break;case"right":default:et+=i+c+V,W.attr("transform",(n,g)=>{let k=m*X.length/2,z=12*i,M=g*m-k;return"translate("+z+","+M+")"});break}let ct=mt.node()?.getBoundingClientRect().width??0,vt=L/2-ct/2,xt=L/2+ct/2,ut=Math.min(0,vt),gt=Math.max(et,xt)-ut;H.attr("viewBox",`${ut} 0 ${gt} ${J}`),D(H,J,gt,l.useMaxWidth)},"draw"),Rt={draw:Mt},Kt={parser:bt,db:pt,renderer:Rt,styles:zt};export{Kt as diagram};
