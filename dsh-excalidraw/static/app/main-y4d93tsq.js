import{A,e,J,l,y,D,C,t,v}from"./main-hnttsvkj.js";var E="",W="",_="",B=[],M=new Map,F=A((r)=>y(r,t()),"sanitizeText"),b=A((r)=>{switch(r.type){case"terminal":return{...r,value:F(r.value)};case"nonterminal":return{...r,name:F(r.name)};case"sequence":return{...r,elements:r.elements.map(b)};case"choice":return{...r,alternatives:r.alternatives.map(b)};case"optional":return{...r,element:b(r.element)};case"repetition":return{...r,element:b(r.element),separator:r.separator?b(r.separator):void 0};case"special":return{...r,text:F(r.text)}}},"sanitizeAstNode"),j=A(()=>{E="",W="",_="",B.length=0,M.clear(),C(),e.debug("[Railroad] Database cleared")},"clear"),I=A((r)=>{E=F(r),e.debug("[Railroad] Title set:",r)},"setTitle"),X=A(()=>E,"getTitle"),K=A((r)=>{let a={...r,name:F(r.name),definition:b(r.definition),comment:r.comment?F(r.comment):void 0};if(e.debug("[Railroad] Adding rule:",a.name),M.has(a.name))e.warn(`[Railroad] Rule '${a.name}' is already defined. Overwriting.`);B.push(a),M.set(a.name,a)},"addRule"),Q=A(()=>B,"getRules"),Z=A((r)=>M.get(r),"getRule"),V=A((r)=>{W=F(r).replace(/^\s+/g,""),e.debug("[Railroad] Accessibility title set:",r)},"setAccTitle"),ee=A(()=>W,"getAccTitle"),te=A((r)=>{_=F(r).replace(/\n\s+/g,`
`),e.debug("[Railroad] Accessibility description set:",r)},"setAccDescription"),re=A(()=>_,"getAccDescription"),ie=I,ne=X,U={clear:j,setTitle:I,getTitle:X,addRule:K,getRules:Q,getRule:Z,setAccTitle:V,getAccTitle:ee,setAccDescription:te,getAccDescription:re,setDiagramTitle:ie,getDiagramTitle:ne},T={compactMode:!1,padding:10,verticalSeparation:8,horizontalSeparation:10,arcRadius:10,fontSize:14,fontFamily:"monospace",terminalFill:"#FFFFC0",terminalStroke:"#000000",terminalTextColor:"#000000",nonTerminalFill:"#FFFFFF",nonTerminalStroke:"#000000",nonTerminalTextColor:"#000000",lineColor:"#000000",strokeWidth:2,markerFill:"#000000",commentFill:"#E8E8E8",commentStroke:"#888888",commentTextColor:"#666666",specialFill:"#F0E0FF",specialStroke:"#8800CC",ruleNameColor:"#000066",showMarkers:!0,markerRadius:5},ae=/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$|^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\([\d\s%+,./-]+\)$|^[a-z]+$/i,oe=/^[\w "',.-]+$/,le=new Set(["compactMode","padding","verticalSeparation","horizontalSeparation","arcRadius","fontSize","fontFamily","terminalFill","terminalStroke","terminalTextColor","nonTerminalFill","nonTerminalStroke","nonTerminalTextColor","lineColor","strokeWidth","markerFill","commentFill","commentStroke","commentTextColor","specialFill","specialStroke","ruleNameColor","showMarkers","markerRadius"]),H=A((r)=>{if(!r)return!1;return Object.keys(r).every((a)=>a==="railroad"||le.has(a))},"isRailroadStyleOptions"),se=A((r)=>{if(!r)return{};if("railroad"in r&&r.railroad)return r.railroad;return H(r)?r:{}},"extractRailroadOverrides"),de=A((r)=>{if(!r||H(r))return{};let{railroad:a,svgId:s,theme:n,look:i,...o}=r;return o},"extractThemeOverrides"),u=A((r,a)=>{if(typeof r!=="string")return a;let s=r.trim();return ae.test(s)?s:a},"sanitizeColorValue"),q=A((r,a)=>{if(typeof r!=="string")return a;let s=r.trim();return oe.test(s)?s:a},"sanitizeFontFamilyValue"),z=A((r,a)=>{let s=typeof r==="number"?r:typeof r==="string"?Number.parseFloat(r):Number.NaN;return Number.isFinite(s)&&s>=0?s:a},"sanitizeNumberValue"),ce=A((r)=>{let a=typeof r==="number"?r:typeof r==="string"?Number.parseFloat(r):Number.NaN;return Number.isFinite(a)&&a>0?a:void 0},"parseThemeFontSize"),me=A((r)=>{let a=q(r.fontFamily,T.fontFamily),s=ce(r.fontSize)??T.fontSize;return{...T,fontFamily:a,fontSize:s,terminalFill:u(r.secondBkg??r.secondaryColor,T.terminalFill),terminalStroke:u(r.secondaryBorderColor??r.lineColor,T.terminalStroke),terminalTextColor:u(r.secondaryTextColor??r.textColor,T.terminalTextColor),nonTerminalFill:u(r.mainBkg??r.background,T.nonTerminalFill),nonTerminalStroke:u(r.primaryBorderColor??r.lineColor,T.nonTerminalStroke),nonTerminalTextColor:u(r.primaryTextColor??r.textColor,T.nonTerminalTextColor),lineColor:u(r.lineColor,T.lineColor),markerFill:u(r.lineColor,T.markerFill),commentFill:u(r.labelBackground??r.tertiaryColor,T.commentFill),commentStroke:u(r.tertiaryBorderColor??r.lineColor,T.commentStroke),commentTextColor:u(r.tertiaryTextColor??r.textColor,T.commentTextColor),specialFill:u(r.tertiaryColor??r.secondaryColor,T.specialFill),specialStroke:u(r.tertiaryBorderColor??r.secondaryBorderColor,T.specialStroke),ruleNameColor:u(r.titleColor??r.textColor,T.ruleNameColor)}},"buildThemeDefaults"),Y=A((r)=>{let a=l(),s={...J(),...a.themeVariables??{},...de(r)},n=me(s),i={...a.railroad??{},...se(r)};return{compactMode:i.compactMode??n.compactMode,padding:z(i.padding,n.padding),verticalSeparation:z(i.verticalSeparation,n.verticalSeparation),horizontalSeparation:z(i.horizontalSeparation,n.horizontalSeparation),arcRadius:z(i.arcRadius,n.arcRadius),fontSize:z(i.fontSize,n.fontSize),fontFamily:q(i.fontFamily,n.fontFamily),terminalFill:u(i.terminalFill,n.terminalFill),terminalStroke:u(i.terminalStroke,n.terminalStroke),terminalTextColor:u(i.terminalTextColor,n.terminalTextColor),nonTerminalFill:u(i.nonTerminalFill,n.nonTerminalFill),nonTerminalStroke:u(i.nonTerminalStroke,n.nonTerminalStroke),nonTerminalTextColor:u(i.nonTerminalTextColor,n.nonTerminalTextColor),lineColor:u(i.lineColor,n.lineColor),strokeWidth:z(i.strokeWidth,n.strokeWidth),markerFill:u(i.markerFill,n.markerFill),commentFill:u(i.commentFill,n.commentFill),commentStroke:u(i.commentStroke,n.commentStroke),commentTextColor:u(i.commentTextColor,n.commentTextColor),specialFill:u(i.specialFill,n.specialFill),specialStroke:u(i.specialStroke,n.specialStroke),ruleNameColor:u(i.ruleNameColor,n.ruleNameColor),showMarkers:i.showMarkers??n.showMarkers,markerRadius:z(i.markerRadius,n.markerRadius)}},"buildRailroadStyleOptions"),RA=A((r)=>{let{fontFamily:a,fontSize:s,terminalFill:n,terminalStroke:i,terminalTextColor:o,nonTerminalFill:g,nonTerminalStroke:m,nonTerminalTextColor:d,lineColor:f,strokeWidth:p,markerFill:h,commentFill:k,commentStroke:c,commentTextColor:x,specialFill:N,specialStroke:R,ruleNameColor:S}=Y(r);return`
  .railroad-diagram {
    font-family: ${a};
    font-size: ${s}px;
  }

  .railroad-terminal rect {
    fill: ${n};
    stroke: ${i};
    stroke-width: ${p}px;
  }

  .railroad-terminal text {
    fill: ${o};
    font-family: ${a};
    font-size: ${s}px;
    text-anchor: middle;
    dominant-baseline: middle;
  }

  .railroad-nonterminal rect {
    fill: ${g};
    stroke: ${m};
    stroke-width: ${p}px;
  }

  .railroad-nonterminal text {
    fill: ${d};
    font-family: ${a};
    font-size: ${s}px;
    text-anchor: middle;
    dominant-baseline: middle;
  }

  .railroad-line {
    stroke: ${f};
    stroke-width: ${p}px;
    fill: none;
  }

  .railroad-start circle,
  .railroad-end circle {
    fill: ${h};
  }

  .railroad-comment ellipse {
    fill: ${k};
    stroke: ${c};
    stroke-width: ${p}px;
  }

  .railroad-comment text {
    fill: ${x};
    font-style: italic;
    font-family: ${a};
    font-size: ${s}px;
    text-anchor: middle;
    dominant-baseline: middle;
  }

  .railroad-special rect {
    fill: ${N};
    stroke: ${R};
    stroke-width: ${p}px;
    stroke-dasharray: 5,3;
  }

  .railroad-special text {
    fill: ${d};
    font-family: ${a};
    font-size: ${s}px;
    text-anchor: middle;
    dominant-baseline: middle;
  }

  .railroad-rule-name {
    font-weight: bold;
    fill: ${S};
    font-family: ${a};
    font-size: ${s}px;
  }

  .railroad-group {
    /* Grouping container, no specific styles */
  }
`},"getStyles"),w=class{constructor(){this.d=""}static{A(this,"PathBuilder")}moveTo(r,a){return this.d+=`M ${r} ${a} `,this}lineTo(r,a){return this.d+=`L ${r} ${a} `,this}horizontalTo(r){return this.d+=`H ${r} `,this}verticalTo(r){return this.d+=`V ${r} `,this}arcTo(r,a,s,n,i,o,g){return this.d+=`A ${r} ${a} ${s} ${n?1:0} ${i?1:0} ${o} ${g} `,this}build(){return this.d.trim()}},he=class{constructor(r,a=Y()){this.textCache=new Map,this.svg=r,this.config=a}static{A(this,"RailroadRenderer")}measureText(r){if(this.textCache.has(r))return this.textCache.get(r);let a=this.svg.append("text").attr("font-family",this.config.fontFamily).attr("font-size",this.config.fontSize).text(r),s=a.node().getBBox(),n={width:s.width,height:s.height};return a.remove(),this.textCache.set(r,n),n}renderTerminal(r,a){let s=this.measureText(a),n=s.width+this.config.padding*2,i=s.height+this.config.padding*2,o=r.append("g").attr("class","railroad-terminal");return o.append("rect").attr("x",0).attr("y",0).attr("width",n).attr("height",i).attr("rx",10).attr("ry",10),o.append("text").attr("x",n/2).attr("y",i/2).text(a),{element:o.node(),dimensions:{width:n,height:i,up:i/2,down:i/2}}}renderNonTerminal(r,a){let s=this.measureText(a),n=s.width+this.config.padding*2,i=s.height+this.config.padding*2,o=r.append("g").attr("class","railroad-nonterminal");return o.append("rect").attr("x",0).attr("y",0).attr("width",n).attr("height",i),o.append("text").attr("x",n/2).attr("y",i/2).text(a),{element:o.node(),dimensions:{width:n,height:i,up:i/2,down:i/2}}}renderSequence(r,a){let s=a.map((d)=>this.renderExpression(r,d)),n=0,i=0,o=0;for(let d of s)n+=d.dimensions.width,i=Math.max(i,d.dimensions.up),o=Math.max(o,d.dimensions.down);n+=(s.length-1)*this.config.horizontalSeparation;let g=r.append("g").attr("class","railroad-sequence"),m=0;for(let d=0;d<s.length;d++){let f=s[d],p=i-f.dimensions.up;if(g.node().appendChild(f.element).setAttribute("transform",`translate(${m}, ${p})`),d<s.length-1){let k=m+f.dimensions.width,c=k+this.config.horizontalSeparation,x=i;g.append("path").attr("class","railroad-line").attr("d",new w().moveTo(k,x).lineTo(c,x).build())}m+=f.dimensions.width+this.config.horizontalSeparation}return{element:g.node(),dimensions:{width:n,height:i+o,up:i,down:o}}}renderChoice(r,a){let s=a.map((h)=>this.renderExpression(r,h)),n=0,i=0;for(let h of s)n=Math.max(n,h.dimensions.width),i+=h.dimensions.height;i+=(s.length-1)*this.config.verticalSeparation;let o=this.config.arcRadius,g=o*4,m=n+g,d=r.append("g").attr("class","railroad-choice"),f=0,p=i/2;for(let h of s){let k=f,c=k+h.dimensions.up,x=o*2+(n-h.dimensions.width)/2;d.node().appendChild(h.element).setAttribute("transform",`translate(${x}, ${k})`);let R=new w,S=c>p;if(c===p)R.moveTo(0,p).lineTo(x,c);else R.moveTo(0,p).arcTo(o,o,0,!1,S,o,p+(S?o:-o)).lineTo(o,c-(S?o:-o)).arcTo(o,o,0,!1,!S,o*2,c).lineTo(x,c);d.append("path").attr("class","railroad-line").attr("d",R.build());let O=new w,P=x+h.dimensions.width,G=m-o*2;if(c===p)O.moveTo(P,c).lineTo(m,p);else O.moveTo(P,c).lineTo(G,c).arcTo(o,o,0,!1,!S,m-o,c+(S?-o:o)).lineTo(m-o,p+(S?o:-o)).arcTo(o,o,0,!1,S,m,p);d.append("path").attr("class","railroad-line").attr("d",O.build()),f+=h.dimensions.height+this.config.verticalSeparation}return{element:d.node(),dimensions:{width:m,height:i,up:p,down:i-p}}}renderOptional(r,a){let s=this.renderExpression(r,a),n=this.config.arcRadius,i=n*2,o=s.dimensions.width+n*4,g=s.dimensions.height+i,m=r.append("g").attr("class","railroad-optional"),d=n*2,f=i;m.node().appendChild(s.element).setAttribute("transform",`translate(${d}, ${f})`);let h=f+s.dimensions.up,k=new w().moveTo(0,h).lineTo(n*2,h);m.append("path").attr("class","railroad-line").attr("d",k.build());let c=new w().moveTo(d+s.dimensions.width,h).lineTo(o,h);m.append("path").attr("class","railroad-line").attr("d",c.build());let x=new w().moveTo(0,h).arcTo(n,n,0,!1,!1,n,h-n).lineTo(n,n).arcTo(n,n,0,!1,!0,n*2,0).lineTo(o-n*2,0).arcTo(n,n,0,!1,!0,o-n,n).lineTo(o-n,h-n).arcTo(n,n,0,!1,!1,o,h);return m.append("path").attr("class","railroad-line").attr("d",x.build()),{element:m.node(),dimensions:{width:o,height:g,up:h,down:g-h}}}renderRepetition(r,a,s){let n=this.renderExpression(r,a),i=this.config.arcRadius,o=i*2,g=n.dimensions.width+i*4,m=s===0,d=n.dimensions.height+o+(m?o:0),f=r.append("g").attr("class","railroad-repetition"),p=i*2,h=m?o:0;f.node().appendChild(n.element).setAttribute("transform",`translate(${p}, ${h})`);let c=h+n.dimensions.up;f.append("path").attr("class","railroad-line").attr("d",new w().moveTo(0,c).lineTo(i*2,c).build()),f.append("path").attr("class","railroad-line").attr("d",new w().moveTo(p+n.dimensions.width,c).lineTo(g,c).build());let x=h+n.dimensions.height+i,N=new w().moveTo(p+n.dimensions.width,c).arcTo(i,i,0,!1,!0,p+n.dimensions.width+i,c+i).lineTo(p+n.dimensions.width+i,x).arcTo(i,i,0,!1,!0,p+n.dimensions.width,x+i).lineTo(i*2,x+i).arcTo(i,i,0,!1,!0,i,x).lineTo(i,c+i).arcTo(i,i,0,!1,!0,i*2,c);if(f.append("path").attr("class","railroad-line").attr("d",N.build()),m){let R=new w().moveTo(0,c).arcTo(i,i,0,!1,!1,i,c-i).lineTo(i,i).arcTo(i,i,0,!1,!0,i*2,0).lineTo(g-i*2,0).arcTo(i,i,0,!1,!0,g-i,i).lineTo(g-i,c-i).arcTo(i,i,0,!1,!1,g,c);f.append("path").attr("class","railroad-line").attr("d",R.build())}return{element:f.node(),dimensions:{width:g,height:d,up:c,down:d-c}}}renderSpecial(r,a){let s=this.measureText("? "+a+" ?"),n=s.width+this.config.padding*2,i=s.height+this.config.padding*2,o=r.append("g").attr("class","railroad-special");return o.append("rect").attr("x",0).attr("y",0).attr("width",n).attr("height",i),o.append("text").attr("x",n/2).attr("y",i/2).text("? "+a+" ?"),{element:o.node(),dimensions:{width:n,height:i,up:i/2,down:i/2}}}renderExpression(r,a){switch(a.type){case"terminal":return this.renderTerminal(r,a.value);case"nonterminal":return this.renderNonTerminal(r,a.name);case"sequence":return this.renderSequence(r,a.elements);case"choice":return this.renderChoice(r,a.alternatives);case"optional":return this.renderOptional(r,a.element);case"repetition":return this.renderRepetition(r,a.element,a.min);case"special":return this.renderSpecial(r,a.text);default:throw Error(`Unknown node type: ${a.type}`)}}renderRule(r,a){let s=this.svg.append("g").attr("class","railroad-rule").attr("transform",`translate(0, ${a})`),n=r.name+" =",i=this.measureText(n).width+20,o=i+20,g=s.append("g"),m=this.renderExpression(g,r.definition),d=Math.max(20,m.dimensions.up),f=d-m.dimensions.up;return g.attr("transform",`translate(${o}, ${f})`),s.append("g").attr("class","railroad-rule-name-group").append("text").attr("class","railroad-rule-name").attr("x",0).attr("y",d).text(n),s.append("g").attr("class","railroad-start").append("circle").attr("cx",i).attr("cy",d).attr("r",this.config.markerRadius),s.append("g").attr("class","railroad-end").append("circle").attr("cx",o+m.dimensions.width+10).attr("cy",d).attr("r",this.config.markerRadius),s.append("path").attr("class","railroad-line").attr("d",new w().moveTo(i+this.config.markerRadius,d).lineTo(o,d).build()),s.append("path").attr("class","railroad-line").attr("d",new w().moveTo(o+m.dimensions.width,d).lineTo(o+m.dimensions.width+10-this.config.markerRadius,d).build()),{height:Math.max(40,f+m.dimensions.height+this.config.padding*2),width:o+m.dimensions.width+10+this.config.markerRadius}}renderDiagram(r){let a=this.config.padding,s=0;for(let n of r){let i=this.renderRule(n,a);a+=i.height+this.config.verticalSeparation,s=Math.max(s,i.width)}return{width:s+this.config.padding*2,height:a+this.config.padding}}},L=A((r,a,s)=>{D(r,a.height,a.width,s),r.attr("viewBox",`0 0 ${a.width} ${a.height}`)},"configureRailroadSvgSize"),pe=A((r,a,s)=>{e.debug(`[Railroad] Rendering diagram
`+r);try{let n=v(a);n.attr("class","railroad-diagram");let o=l().railroad?.useMaxWidth??!0,g=U.getRules();if(e.debug(`[Railroad] Rendering ${g.length} rules`),g.length===0){e.warn("[Railroad] No rules to render"),L(n,{height:100,width:200},o);return}let d=new he(n,Y()).renderDiagram(g);L(n,d,o),e.debug("[Railroad] Render complete")}catch(n){throw e.error("[Railroad] Render error:",n),n}},"draw"),NA={draw:pe};
export{U,RA,NA};
