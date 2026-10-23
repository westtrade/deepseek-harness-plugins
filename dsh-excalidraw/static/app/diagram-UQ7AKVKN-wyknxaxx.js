import{F}from"./main-h8tccrhj.js";import{A,e,J,f,l,D,C,B,E,d,I,p,Q,v,b}from"./main-0wcnesay.js";import{N}from"./main-xza10ybe.js";var w={showLegend:!0,ticks:5,max:null,min:0,graticule:"circle"},k=32,O={axes:[],curves:[],options:w},y=structuredClone(O),H=f.radar,j=A(()=>b({...H,...l().radar}),"getConfig"),R=A(()=>y.axes,"getAxes"),U=A(()=>y.curves,"getCurves"),X=A(()=>y.options,"getOptions"),K=A((r)=>{y.axes=r.map((t)=>({name:t.name,label:t.label??t.name}))},"setAxes"),Y=A((r)=>{y.curves=r.map((t)=>({name:t.name,label:t.label??t.name,entries:Z(t.entries)}))},"setCurves"),Z=A((r)=>{if(r[0].axis==null)return r.map((a)=>a.value);let t=R();if(t.length===0)throw Error("Axes must be populated before curves for reference entries");return t.map((a)=>{let n=r.find((s)=>s.axis?.$refText===a.name);if(n===void 0)throw Error("Missing entry for axis "+a.label);return n.value})},"computeCurveEntries"),q=A((r)=>{let t=r.reduce((a,n)=>(a[n.name]=n,a),{});if(y.options={showLegend:t.showLegend?.value??w.showLegend,ticks:t.ticks?.value??w.ticks,max:t.max?.value??w.max,min:t.min?.value??w.min,graticule:t.graticule?.value??w.graticule},y.options.ticks>k)e.warn(`Radar diagram ticks (${y.options.ticks}) exceeds maximum allowed (${k}). Using ${k} instead.`),y.options.ticks=k},"setOptions"),tt=A(()=>{C(),y=structuredClone(O)},"clear"),T={getAxes:R,getCurves:U,getOptions:X,setAxes:K,setCurves:Y,setOptions:q,getConfig:j,clear:tt,setAccTitle:B,getAccTitle:E,setDiagramTitle:p,getDiagramTitle:Q,getAccDescription:I,setAccDescription:d},et=A((r)=>{F(r,T);let{axes:t,curves:a,options:n}=r;T.setAxes(t),T.setCurves(a),T.setOptions(n)},"populate"),at={parse:A(async(r)=>{let t=await N("radar",r);e.debug(t),et(t)},"parse")},rt=A((r,t,a,n)=>{let s=n.db,c=s.getAxes(),u=s.getCurves(),o=s.getOptions(),i=s.getConfig(),m=s.getDiagramTitle(),x=v(t),g=nt(x,i),h=o.max??Math.max(...u.map((S)=>Math.max(...S.entries))),M=o.min,L=Math.min(i.width,i.height)/2;st(g,c,L,o.ticks,o.graticule),ot(g,c,L,i),_(g,c,u,M,h,o.graticule,i),G(g,u,o.showLegend,i),g.append("text").attr("class","radarTitle").text(m).attr("x",0).attr("y",-i.height/2-i.marginTop)},"draw"),nt=A((r,t)=>{let a=t.width+t.marginLeft+t.marginRight,n=t.height+t.marginTop+t.marginBottom,s={x:t.marginLeft+t.width/2,y:t.marginTop+t.height/2};return D(r,n,a,t.useMaxWidth??!0),r.attr("viewBox",`0 0 ${a} ${n}`).attr("overflow","visible"),r.append("g").attr("transform",`translate(${s.x}, ${s.y})`)},"drawFrame"),st=A((r,t,a,n,s)=>{if(s==="circle")for(let c=0;c<n;c++){let u=a*(c+1)/n;r.append("circle").attr("r",u).attr("class","radarGraticule")}else if(s==="polygon"){let c=t.length;for(let u=0;u<n;u++){let o=a*(u+1)/n,i=t.map((m,x)=>{let g=2*x*Math.PI/c-Math.PI/2,h=o*Math.cos(g),M=o*Math.sin(g);return`${h},${M}`}).join(" ");r.append("polygon").attr("points",i).attr("class","radarGraticule")}}},"drawGraticule"),ot=A((r,t,a,n)=>{let s=t.length;for(let c=0;c<s;c++){let u=t[c].label,o=2*c*Math.PI/s-Math.PI/2,i=Math.cos(o),m=Math.sin(o);r.append("line").attr("x1",0).attr("y1",0).attr("x2",a*n.axisScaleFactor*i).attr("y2",a*n.axisScaleFactor*m).attr("class","radarAxisLine");let x=i>0.01?"start":i<-0.01?"end":"middle",g=m>0.01?"hanging":m<-0.01?"auto":"central",h=4;r.append("text").text(u).attr("x",a*n.axisLabelFactor*i+h*i).attr("y",a*n.axisLabelFactor*m+h*m).attr("text-anchor",x).attr("dominant-baseline",g).attr("class","radarAxisLabel")}},"drawAxes");function _(r,t,a,n,s,c,u){let o=t.length,i=Math.min(u.width,u.height)/2;a.forEach((m,x)=>{if(m.entries.length!==o)return;let g=m.entries.map((h,M)=>{let L=2*Math.PI*M/o-Math.PI/2,S=P(h,n,s,i),W=S*Math.cos(L),V=S*Math.sin(L);return{x:W,y:V}});if(c==="circle")r.append("path").attr("d",z(g,u.curveTension)).attr("class",`radarCurve-${x}`);else if(c==="polygon")r.append("polygon").attr("points",g.map((h)=>`${h.x},${h.y}`).join(" ")).attr("class",`radarCurve-${x}`)})}A(_,"drawCurves");function P(r,t,a,n){let s=Math.min(Math.max(r,t),a);return n*(s-t)/(a-t)}A(P,"relativeRadius");function z(r,t){let a=r.length,n=`M${r[0].x},${r[0].y}`;for(let s=0;s<a;s++){let c=r[(s-1+a)%a],u=r[s],o=r[(s+1)%a],i=r[(s+2)%a],m={x:u.x+(o.x-c.x)*t,y:u.y+(o.y-c.y)*t},x={x:o.x-(i.x-u.x)*t,y:o.y-(i.y-u.y)*t};n+=` C${m.x},${m.y} ${x.x},${x.y} ${o.x},${o.y}`}return`${n} Z`}A(z,"closedRoundCurve");function G(r,t,a,n){if(!a)return;let s=(n.width/2+n.marginRight)*3/4,c=-(n.height/2+n.marginTop)*3/4,u=20;t.forEach((o,i)=>{let m=r.append("g").attr("transform",`translate(${s}, ${c+i*u})`);m.append("rect").attr("width",12).attr("height",12).attr("class",`radarLegendBox-${i}`),m.append("text").attr("x",16).attr("y",0).attr("class","radarLegendText").text(o.label)})}A(G,"drawLegend");var it={draw:rt},lt=A((r,t)=>{let a="";for(let n=0;n<r.THEME_COLOR_LIMIT;n++){let s=r[`cScale${n}`];a+=`
		.radarCurve-${n} {
			color: ${s};
			fill: ${s};
			fill-opacity: ${t.curveOpacity};
			stroke: ${s};
			stroke-width: ${t.curveStrokeWidth};
		}
		.radarLegendBox-${n} {
			fill: ${s};
			fill-opacity: ${t.curveOpacity};
			stroke: ${s};
		}
		`}return a},"genIndexStyles"),ct=A((r)=>{let t=J(),a=l(),n=b(t,a.themeVariables),s=b(n.radar,r);return{themeVariables:n,radarOptions:s}},"buildRadarStyleOptions"),dt=A(({radar:r}={})=>{let{themeVariables:t,radarOptions:a}=ct(r);return`
	.radarTitle {
		font-size: ${t.fontSize};
		color: ${t.titleColor};
		dominant-baseline: hanging;
		text-anchor: middle;
	}
	.radarAxisLine {
		stroke: ${a.axisColor};
		stroke-width: ${a.axisStrokeWidth};
	}
	.radarAxisLabel {
		font-size: ${a.axisLabelFontSize}px;
		color: ${a.axisColor};
	}
	.radarGraticule {
		fill: ${a.graticuleColor};
		fill-opacity: ${a.graticuleOpacity};
		stroke: ${a.graticuleColor};
		stroke-width: ${a.graticuleStrokeWidth};
	}
	.radarLegendText {
		text-anchor: start;
		font-size: ${a.legendFontSize}px;
		dominant-baseline: hanging;
	}
	${lt(t,a)}
	`},"styles"),$t={parser:at,db:T,renderer:it,styles:dt};export{$t as diagram};
