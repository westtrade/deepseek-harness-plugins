import{F}from"./main-zheazd2p.js";import{A,e,J,f,l,D,C,B,E,d,I,p,Q,v,b}from"./main-cbwdhkyr.js";import{N}from"./main-4q8m77fd.js";var xt=A(()=>({domains:new Map,transitions:[]}),"createDefaultData"),at=xt(),Mt=A(()=>at.domains,"getDomains"),zt=A(()=>at.transitions,"getTransitions"),Lt=A((t)=>{if(!t)return;for(let n of t){let o=n.domain,a=(n.items??[]).map((c)=>({label:c.label}));at.domains.set(o,{name:o,items:a})}},"setDomains"),Nt=A((t)=>{if(!t)return;at.transitions=t.filter((n)=>{if(n.from===n.to)return e.warn(`Cynefin: self-loop transition on domain "${n.from}" is not meaningful and will be skipped.`),!1;return!0}).map((n)=>({from:n.from,to:n.to,label:n.label||void 0}))},"setTransitions"),Pt=A(()=>b({...f.cynefin,...l().cynefin}),"getConfig"),It=A(()=>{C(),at=xt()},"clear"),st={getDomains:Mt,getTransitions:zt,setDomains:Lt,setTransitions:Nt,getConfig:Pt,clear:It,setAccTitle:B,getAccTitle:E,setDiagramTitle:p,getDiagramTitle:Q,getAccDescription:I,setAccDescription:d},Wt=A((t)=>{F(t,st),st.setDomains(t.domains),st.setTransitions(t.transitions)},"populate"),Rt={parse:A(async(t)=>{let n=await N("cynefin",t);e.debug(n),Wt(n)},"parse")};function ot(t){let n=t+1831565813|0;return n=Math.imul(n^n>>>15,n|1),n^=n+Math.imul(n^n>>>7,n|61),((n^n>>>14)>>>0)/4294967296}A(ot,"seededRandom");function $t(t){let n=0;for(let o=0;o<t.length;o++){let a=t.charCodeAt(o);n=(n<<5)-n+a,n|=0}return n}A($t,"hashString");function bt(t,n){if(typeof t==="number"&&Number.isFinite(t)&&t!==0)return t;return $t(n)}A(bt,"resolveSeed");function wt(t,n,o,a){let c=t/2,g=a??t*0.015,rt=7,Z=n/7,y=[];for(let r=0;r<=7;r++){let h=ot(o+r*17)*g*2-g;y.push({x:c+h,y:r*Z})}let W=`M${y[0].x},${y[0].y}`;for(let r=0;r<y.length-1;r++){let h=y[r],s=y[r+1],u=(h.y+s.y)/2,z=r%2===0?1:-1,k=g*1.5*z*ot(o+r*31+7),K=h.x+k,tt=u,et=s.x-k;W+=` C${K},${tt} ${et},${u} ${s.x},${s.y}`}return W}A(wt,"generateFoldPath");function Ct(t,n,o,a){let c=n/2,g=a??n*0.015,rt=7,Z=t/7,y=[];for(let r=0;r<=7;r++){let h=ot(o+r*23)*g*2-g;y.push({x:r*Z,y:c+h})}let W=`M${y[0].x},${y[0].y}`;for(let r=0;r<y.length-1;r++){let h=y[r],s=y[r+1],u=(h.x+s.x)/2,z=r%2===0?1:-1,k=g*1.5*z*ot(o+r*37+11),K=u,tt=h.y+k,et=u,O=s.y-k;W+=` C${K},${tt} ${et},${O} ${s.x},${s.y}`}return W}A(Ct,"generateHorizontalBoundary");function vt(t,n){let o=t/2,a=n*0.5,c=n,g=t*0.03;return[`M${o},${a}`,`C${o+g},${a+(c-a)*0.2}`,`${o-g*1.5},${a+(c-a)*0.55}`,`${o+g*0.5},${a+(c-a)*0.75}`,`C${o-g},${a+(c-a)*0.85}`,`${o+g*0.3},${a+(c-a)*0.95}`,`${o},${c}`].join(" ")}A(vt,"generateCliffPath");function Dt(t,n,o,a){return[`M${t-o},${n}`,`A${o},${a} 0 1,1 ${t+o},${n}`,`A${o},${a} 0 1,1 ${t-o},${n}`,"Z"].join(" ")}A(Dt,"generateConfusionPath");var ht={complex:{model:"Probe → Sense → Respond",practice:"Emergent Practices"},complicated:{model:"Sense → Analyse → Respond",practice:"Good Practices"},clear:{model:"Sense → Categorise → Respond",practice:"Best Practices"},chaotic:{model:"Act → Sense → Respond",practice:"Novel Practices"},confusion:{model:"",practice:"Disorder"}},Ft=A((t,n)=>{let o=t/2,a=n/2;return{complex:{cx:o/2,cy:a/2,x:0,y:0,w:o,h:a},complicated:{cx:o+o/2,cy:a/2,x:o,y:0,w:o,h:a},chaotic:{cx:o/2,cy:a+a/2,x:0,y:a,w:o,h:a},clear:{cx:o+o/2,cy:a+a/2,x:o,y:a,w:o,h:a},confusion:{cx:o,cy:a,x:o*0.7,y:a*0.7,w:o*0.6,h:a*0.6}}},"getDomainLayouts"),Vt=A(()=>{let t=J(),n=l();return b(t,n.themeVariables).cynefin},"getCynefinDomainColors"),dt=3,_t=A((t,n,o,a)=>{let c=a.db,g=c.getDomains(),rt=c.getTransitions(),Z=c.getDiagramTitle(),y=c.getAccTitle(),W=c.getAccDescription(),r=c.getConfig(),h=Vt();e.debug("Rendering Cynefin diagram");let{width:s,height:u,padding:z,showDomainDescriptions:k,boundaryAmplitude:K}=r,tt=s+z*2,et=u+z*2,O={complex:h.complexBg,complicated:h.complicatedBg,clear:h.clearBg,chaotic:h.chaoticBg,confusion:h.confusionBg},R=v(n);if(D(R,et,tt,r.useMaxWidth??!0),R.attr("viewBox",`0 0 ${tt} ${et}`),y)R.append("title").text(y);if(W)R.append("desc").text(W);let V=R.append("g").attr("transform",`translate(${z}, ${z})`),nt=Ft(s,u),ft=bt(r.seed,n),kt=V.append("g").attr("class","cynefin-backgrounds"),ct=["complex","complicated","chaotic","clear"];for(let m of ct){let i=nt[m];kt.append("rect").attr("class","cynefinDomain").attr("x",i.x).attr("y",i.y).attr("width",i.w).attr("height",i.h).attr("fill",O[m]).attr("fill-opacity",0.4).attr("stroke","none")}let lt=V.append("g").attr("class","cynefin-boundaries");lt.append("path").attr("class","cynefinBoundary").attr("d",wt(s,u,ft,K)).attr("fill","none"),lt.append("path").attr("class","cynefinBoundary").attr("d",Ct(s,u,ft+100,K)).attr("fill","none"),lt.append("path").attr("class","cynefinCliff").attr("d",vt(s,u)).attr("fill","none");let Tt=s*0.15,At=u*0.15;V.append("path").attr("class","cynefinConfusion").attr("d",Dt(s/2,u/2,Tt,At)).attr("fill",O.confusion).attr("fill-opacity",0.5);let mt=V.append("g").attr("class","cynefin-labels");for(let m of ct){let i=nt[m];mt.append("text").attr("class","cynefinDomainLabel").attr("x",i.cx).attr("y",k?i.cy-30:i.cy).attr("text-anchor","middle").attr("dominant-baseline","middle").text(m.charAt(0).toUpperCase()+m.slice(1))}if(mt.append("text").attr("class","cynefinDomainLabel").attr("x",s/2).attr("y",k?u/2-10:u/2).attr("text-anchor","middle").attr("dominant-baseline","middle").text("Confusion"),k){let m=V.append("g").attr("class","cynefin-subtitles");for(let i of ct){let w=nt[i],x=ht[i];m.append("text").attr("class","cynefinSubtitle").attr("x",w.cx).attr("y",w.cy-10).attr("text-anchor","middle").attr("dominant-baseline","middle").text(x.model),m.append("text").attr("class","cynefinSubtitle").attr("x",w.cx).attr("y",w.cy+5).attr("text-anchor","middle").attr("dominant-baseline","middle").text(x.practice)}m.append("text").attr("class","cynefinSubtitle").attr("x",s/2).attr("y",u/2+8).attr("text-anchor","middle").attr("dominant-baseline","middle").text(ht.confusion.practice)}let pt=V.append("g").attr("class","cynefin-items"),_=26,yt=10,Bt=["complex","complicated","chaotic","clear","confusion"];for(let m of Bt){let i=g.get(m);if(!i||i.items.length===0)continue;let w=nt[m],x=m==="confusion",X=i.items,j=0;if(x&&i.items.length>dt)j=i.items.length-dt,X=i.items.slice(0,dt);let H;if(x){let S=k?22:14;H=w.cy+S}else H=w.cy+(k?25:15);if([...X].forEach((S,G)=>{let L=H+G*(_+4),Y=pt.append("g"),q=Y.append("text").attr("class","cynefinItemText").attr("x",0).attr("y",_/2).attr("text-anchor","middle").attr("dominant-baseline","central").text(S.label),M=S.label.length*7,T=q.node();if(T&&typeof T.getBBox==="function"){let it=T.getBBox();if(it.width>0)M=it.width}let P=M+yt*2,U=w.cx-P/2;Y.attr("transform",`translate(${U}, ${L})`),Y.insert("rect","text").attr("class","cynefinItem").attr("x",0).attr("y",0).attr("width",P).attr("height",_).attr("rx",4).attr("ry",4).attr("fill",O[m]).attr("fill-opacity",0.95),q.attr("x",P/2).attr("y",_/2)}),j>0){let S=H+X.length*(_+4),G=`+${j} more`,L=pt.append("g"),Y=L.append("text").attr("class","cynefinItemText").attr("x",0).attr("y",_/2).attr("text-anchor","middle").attr("dominant-baseline","central").text(G),q=G.length*7,M=Y.node();if(M&&typeof M.getBBox==="function"){let U=M.getBBox();if(U.width>0)q=U.width}let T=q+yt*2,P=w.cx-T/2;L.attr("transform",`translate(${P}, ${S})`),L.insert("rect","text").attr("class","cynefinItemOverflow").attr("x",0).attr("y",0).attr("width",T).attr("height",_).attr("rx",4).attr("ry",4).attr("fill",O[m]).attr("fill-opacity",0.6),Y.attr("x",T/2).attr("y",_/2)}}if(rt.length>0){let m=R.select("defs").empty()?R.append("defs"):R.select("defs"),i=`cynefin-arrow-${n}`;m.append("marker").attr("id",i).attr("viewBox","0 0 10 10").attr("refX",9).attr("refY",5).attr("markerWidth",6).attr("markerHeight",6).attr("orient","auto-start-reverse").append("path").attr("d","M 0 0 L 10 5 L 0 10 z").attr("class","cynefinArrowHead");let w=V.append("g").attr("class","cynefin-arrows");rt.forEach((x)=>{let X=nt[x.from],j=nt[x.to];if(!X||!j)return;if(x.from===x.to){e.warn(`Cynefin renderer: skipping self-loop on domain "${x.from}"`);return}let{cx:H,cy:S}=X,{cx:G,cy:L}=j,Y=(H+G)/2,q=(S+L)/2,M=G-H,T=L-S,P=Math.sqrt(M*M+T*T),U=P*0.15,it=-T/P,St=M/P,ut=Y+it*U,gt=q+St*U;if(w.append("path").attr("class","cynefinArrowLine").attr("d",`M${H},${S} Q${ut},${gt} ${G},${L}`).attr("fill","none").attr("marker-end",`url(#${i})`),x.label)w.append("text").attr("class","cynefinArrowLabel").attr("x",ut).attr("y",gt-6).attr("text-anchor","middle").attr("dominant-baseline","auto").text(x.label)})}if(Z)V.append("text").attr("class","cynefinTitle").attr("x",s/2).attr("y",-z/2).attr("text-anchor","middle").attr("dominant-baseline","middle").text(Z)},"draw"),Et={draw:_t},Ht=A(()=>{let t=J(),n=l();return b(t,n.themeVariables).cynefin},"getCynefinTheme"),Gt=A(()=>{let t=Ht();return`
	.cynefinDomain {
		stroke: none;
	}
	.cynefinDomainLabel {
		font-size: ${t.domainFontSize}px;
		font-weight: bold;
		fill: ${t.labelColor};
	}
	.cynefinSubtitle {
		font-size: ${t.itemFontSize-1}px;
		fill: ${t.textColor};
		font-style: italic;
	}
	.cynefinItem {
		fill-opacity: 0.95;
		stroke: ${t.boundaryColor};
		stroke-width: 1;
	}
	.cynefinItemText {
		font-size: ${t.itemFontSize}px;
		fill: ${t.textColor};
	}
	.cynefinItemOverflow {
		fill-opacity: 0.6;
		stroke: ${t.boundaryColor};
		stroke-width: 1;
		stroke-dasharray: 3 2;
	}
	.cynefinBoundary {
		stroke: ${t.boundaryColor};
		stroke-width: ${t.boundaryWidth};
		stroke-dasharray: 6 3;
	}
	.cynefinCliff {
		stroke: ${t.cliffColor};
		stroke-width: ${t.cliffWidth};
	}
	.cynefinConfusion {
		stroke: ${t.boundaryColor};
		stroke-width: 1.5;
		stroke-dasharray: 4 2;
	}
	.cynefinArrowLine {
		stroke: ${t.arrowColor};
		stroke-width: ${t.arrowWidth};
		fill: none;
	}
	.cynefinArrowHead {
		fill: ${t.arrowColor};
		stroke: none;
	}
	.cynefinArrowLabel {
		font-size: ${t.itemFontSize-1}px;
		fill: ${t.textColor};
	}
	.cynefinTitle {
		font-size: ${t.domainFontSize+2}px;
		font-weight: bold;
		fill: ${t.labelColor};
	}
	`},"styles"),Yt=Gt,Jt={parser:Rt,db:st,renderer:Et,styles:Yt};export{Jt as diagram};
