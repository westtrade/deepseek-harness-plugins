import{A,D,C,B,E,d,I,p,Q,t,u}from"./main-0wcnesay.js";import{re,bt,Qi,cA}from"./main-ct7v91je.js";import{vA}from"./main-aa4vtma9.js";import{EA}from"./main-dab0j427.js";var nt=function(){var e=A(function(h,n,s,l){for(s=s||{},l=h.length;l--;s[h[l]]=n);return s},"o"),r=[6,8,10,11,12,14,16,17,18],a=[1,9],m=[1,10],i=[1,11],y=[1,12],x=[1,13],o=[1,14],k={trace:A(function(){},"trace"),yy:{},symbols_:{error:2,start:3,journey:4,document:5,EOF:6,line:7,SPACE:8,statement:9,NEWLINE:10,title:11,acc_title:12,acc_title_value:13,acc_descr:14,acc_descr_value:15,acc_descr_multiline_value:16,section:17,taskName:18,taskData:19,$accept:0,$end:1},terminals_:{2:"error",4:"journey",6:"EOF",8:"SPACE",10:"NEWLINE",11:"title",12:"acc_title",13:"acc_title_value",14:"acc_descr",15:"acc_descr_value",16:"acc_descr_multiline_value",17:"section",18:"taskName",19:"taskData"},productions_:[0,[3,3],[5,0],[5,2],[7,2],[7,1],[7,1],[7,1],[9,1],[9,2],[9,2],[9,1],[9,1],[9,2]],performAction:A(function(n,s,l,f,g,c,T){var v=c.length-1;switch(g){case 1:return c[v-1];case 2:this.$=[];break;case 3:c[v-1].push(c[v]),this.$=c[v-1];break;case 4:case 5:this.$=c[v];break;case 6:case 7:this.$=[];break;case 8:f.setDiagramTitle(c[v].substr(6)),this.$=c[v].substr(6);break;case 9:this.$=c[v].trim(),f.setAccTitle(this.$);break;case 10:case 11:this.$=c[v].trim(),f.setAccDescription(this.$);break;case 12:f.addSection(c[v].substr(8)),this.$=c[v].substr(8);break;case 13:f.addTask(c[v-1],c[v]),this.$="task";break}},"anonymous"),table:[{3:1,4:[1,2]},{1:[3]},e(r,[2,2],{5:3}),{6:[1,4],7:5,8:[1,6],9:7,10:[1,8],11:a,12:m,14:i,16:y,17:x,18:o},e(r,[2,7],{1:[2,1]}),e(r,[2,3]),{9:15,11:a,12:m,14:i,16:y,17:x,18:o},e(r,[2,5]),e(r,[2,6]),e(r,[2,8]),{13:[1,16]},{15:[1,17]},e(r,[2,11]),e(r,[2,12]),{19:[1,18]},e(r,[2,4]),e(r,[2,9]),e(r,[2,10]),e(r,[2,13])],defaultActions:{},parseError:A(function(n,s){if(s.recoverable)this.trace(n);else{var l=Error(n);throw l.hash=s,l}},"parseError"),parse:A(function(n){var s=this,l=[0],f=[],g=[null],c=[],T=this.table,v="",j=0,ot=0,ct=0,vt=2,ht=1,wt=c.slice.call(arguments,1),w=Object.create(this.lexer),z={yy:{}};for(var J in this.yy)if(Object.prototype.hasOwnProperty.call(this.yy,J))z.yy[J]=this.yy[J];if(w.setInput(n,z.yy),z.yy.lexer=w,z.yy.parser=this,typeof w.yylloc>"u")w.yylloc={};var K=w.yylloc;c.push(K);var Tt=w.options&&w.options.ranges;if(typeof z.yy.parseError==="function")this.parseError=z.yy.parseError;else this.parseError=Object.getPrototypeOf(this).parseError;function St(P){l.length=l.length-2*P,g.length=g.length-P,c.length=c.length-P}A(St,"popStack");function ut(){var P=f.pop()||w.lex()||ht;if(typeof P!=="number"){if(P instanceof Array)f=P,P=f.pop();P=s.symbols_[P]||P}return P}A(ut,"lex");var S,tt,W,M,Gt,et,O={},H,R,yt,U;while(!0){if(W=l[l.length-1],this.defaultActions[W])M=this.defaultActions[W];else{if(S===null||typeof S>"u")S=ut();M=T[W]&&T[W][S]}if(typeof M>"u"||!M.length||!M[0]){var rt="";U=[];for(H in T[W])if(this.terminals_[H]&&H>vt)U.push("'"+this.terminals_[H]+"'");if(w.showPosition)rt="Parse error on line "+(j+1)+`:
`+w.showPosition()+`
Expecting `+U.join(", ")+", got '"+(this.terminals_[S]||S)+"'";else rt="Parse error on line "+(j+1)+": Unexpected "+(S==ht?"end of input":"'"+(this.terminals_[S]||S)+"'");this.parseError(rt,{text:w.match,token:this.terminals_[S]||S,line:w.yylineno,loc:K,expected:U})}if(M[0]instanceof Array&&M.length>1)throw Error("Parse Error: multiple actions possible at state: "+W+", token: "+S);switch(M[0]){case 1:if(l.push(S),g.push(w.yytext),c.push(w.yylloc),l.push(M[1]),S=null,!tt){if(ot=w.yyleng,v=w.yytext,j=w.yylineno,K=w.yylloc,ct>0)ct--}else S=tt,tt=null;break;case 2:if(R=this.productions_[M[1]][1],O.$=g[g.length-R],O._$={first_line:c[c.length-(R||1)].first_line,last_line:c[c.length-1].last_line,first_column:c[c.length-(R||1)].first_column,last_column:c[c.length-1].last_column},Tt)O._$.range=[c[c.length-(R||1)].range[0],c[c.length-1].range[1]];if(et=this.performAction.apply(O,[v,ot,j,z.yy,M[1],g,c].concat(wt)),typeof et<"u")return et;if(R)l=l.slice(0,-1*R*2),g=g.slice(0,-1*R),c=c.slice(0,-1*R);l.push(this.productions_[M[1]][0]),g.push(O.$),c.push(O._$),yt=T[l[l.length-2]][l[l.length-1]],l.push(yt);break;case 3:return!0}}return!0},"parse")},b=function(){var h={EOF:1,parseError:A(function(s,l){if(this.yy.parser)this.yy.parser.parseError(s,l);else throw Error(s)},"parseError"),setInput:A(function(n,s){if(this.yy=s||this.yy||{},this._input=n,this._more=this._backtrack=this.done=!1,this.yylineno=this.yyleng=0,this.yytext=this.matched=this.match="",this.conditionStack=["INITIAL"],this.yylloc={first_line:1,first_column:0,last_line:1,last_column:0},this.options.ranges)this.yylloc.range=[0,0];return this.offset=0,this},"setInput"),input:A(function(){var n=this._input[0];this.yytext+=n,this.yyleng++,this.offset++,this.match+=n,this.matched+=n;var s=n.match(/(?:\r\n?|\n).*/g);if(s)this.yylineno++,this.yylloc.last_line++;else this.yylloc.last_column++;if(this.options.ranges)this.yylloc.range[1]++;return this._input=this._input.slice(1),n},"input"),unput:A(function(n){var s=n.length,l=n.split(/(?:\r\n?|\n)/g);this._input=n+this._input,this.yytext=this.yytext.substr(0,this.yytext.length-s),this.offset-=s;var f=this.match.split(/(?:\r\n?|\n)/g);if(this.match=this.match.substr(0,this.match.length-1),this.matched=this.matched.substr(0,this.matched.length-1),l.length-1)this.yylineno-=l.length-1;var g=this.yylloc.range;if(this.yylloc={first_line:this.yylloc.first_line,last_line:this.yylineno+1,first_column:this.yylloc.first_column,last_column:l?(l.length===f.length?this.yylloc.first_column:0)+f[f.length-l.length].length-l[0].length:this.yylloc.first_column-s},this.options.ranges)this.yylloc.range=[g[0],g[0]+this.yyleng-s];return this.yyleng=this.yytext.length,this},"unput"),more:A(function(){return this._more=!0,this},"more"),reject:A(function(){if(this.options.backtrack_lexer)this._backtrack=!0;else return this.parseError("Lexical error on line "+(this.yylineno+1)+`. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).
`+this.showPosition(),{text:"",token:null,line:this.yylineno});return this},"reject"),less:A(function(n){this.unput(this.match.slice(n))},"less"),pastInput:A(function(){var n=this.matched.substr(0,this.matched.length-this.match.length);return(n.length>20?"...":"")+n.substr(-20).replace(/\n/g,"")},"pastInput"),upcomingInput:A(function(){var n=this.match;if(n.length<20)n+=this._input.substr(0,20-n.length);return(n.substr(0,20)+(n.length>20?"...":"")).replace(/\n/g,"")},"upcomingInput"),showPosition:A(function(){var n=this.pastInput(),s=Array(n.length+1).join("-");return n+this.upcomingInput()+`
`+s+"^"},"showPosition"),test_match:A(function(n,s){var l,f,g;if(this.options.backtrack_lexer){if(g={yylineno:this.yylineno,yylloc:{first_line:this.yylloc.first_line,last_line:this.last_line,first_column:this.yylloc.first_column,last_column:this.yylloc.last_column},yytext:this.yytext,match:this.match,matches:this.matches,matched:this.matched,yyleng:this.yyleng,offset:this.offset,_more:this._more,_input:this._input,yy:this.yy,conditionStack:this.conditionStack.slice(0),done:this.done},this.options.ranges)g.yylloc.range=this.yylloc.range.slice(0)}if(f=n[0].match(/(?:\r\n?|\n).*/g),f)this.yylineno+=f.length;if(this.yylloc={first_line:this.yylloc.last_line,last_line:this.yylineno+1,first_column:this.yylloc.last_column,last_column:f?f[f.length-1].length-f[f.length-1].match(/\r?\n?/)[0].length:this.yylloc.last_column+n[0].length},this.yytext+=n[0],this.match+=n[0],this.matches=n,this.yyleng=this.yytext.length,this.options.ranges)this.yylloc.range=[this.offset,this.offset+=this.yyleng];if(this._more=!1,this._backtrack=!1,this._input=this._input.slice(n[0].length),this.matched+=n[0],l=this.performAction.call(this,this.yy,this,s,this.conditionStack[this.conditionStack.length-1]),this.done&&this._input)this.done=!1;if(l)return l;else if(this._backtrack){for(var c in g)this[c]=g[c];return!1}return!1},"test_match"),next:A(function(){if(this.done)return this.EOF;if(!this._input)this.done=!0;var n,s,l,f;if(!this._more)this.yytext="",this.match="";var g=this._currentRules();for(var c=0;c<g.length;c++)if(l=this._input.match(this.rules[g[c]]),l&&(!s||l[0].length>s[0].length)){if(s=l,f=c,this.options.backtrack_lexer)if(n=this.test_match(l,g[c]),n!==!1)return n;else if(this._backtrack){s=!1;continue}else return!1;else if(!this.options.flex)break}if(s){if(n=this.test_match(s,g[f]),n!==!1)return n;return!1}if(this._input==="")return this.EOF;else return this.parseError("Lexical error on line "+(this.yylineno+1)+`. Unrecognized text.
`+this.showPosition(),{text:"",token:null,line:this.yylineno})},"next"),lex:A(function(){var s=this.next();if(s)return s;else return this.lex()},"lex"),begin:A(function(s){this.conditionStack.push(s)},"begin"),popState:A(function(){var s=this.conditionStack.length-1;if(s>0)return this.conditionStack.pop();else return this.conditionStack[0]},"popState"),_currentRules:A(function(){if(this.conditionStack.length&&this.conditionStack[this.conditionStack.length-1])return this.conditions[this.conditionStack[this.conditionStack.length-1]].rules;else return this.conditions.INITIAL.rules},"_currentRules"),topState:A(function(s){if(s=this.conditionStack.length-1-Math.abs(s||0),s>=0)return this.conditionStack[s];else return"INITIAL"},"topState"),pushState:A(function(s){this.begin(s)},"pushState"),stateStackSize:A(function(){return this.conditionStack.length},"stateStackSize"),options:{"case-insensitive":!0},performAction:A(function(s,l,f,g){var c=g;switch(f){case 0:break;case 1:break;case 2:return 10;case 3:break;case 4:break;case 5:return 4;case 6:return 11;case 7:return this.begin("acc_title"),12;break;case 8:return this.popState(),"acc_title_value";break;case 9:return this.begin("acc_descr"),14;break;case 10:return this.popState(),"acc_descr_value";break;case 11:this.begin("acc_descr_multiline");break;case 12:this.popState();break;case 13:return"acc_descr_multiline_value";case 14:return 17;case 15:return 18;case 16:return 19;case 17:return":";case 18:return 6;case 19:return"INVALID"}},"anonymous"),rules:[/^(?:%(?!\{)[^\n]*)/i,/^(?:[^\}]%%[^\n]*)/i,/^(?:[\n]+)/i,/^(?:\s+)/i,/^(?:#[^\n]*)/i,/^(?:journey\b)/i,/^(?:title\s[^#\n;]+)/i,/^(?:accTitle\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*\{\s*)/i,/^(?:[\}])/i,/^(?:[^\}]*)/i,/^(?:section\s[^#:\n;]+)/i,/^(?:[^#:\n;]+)/i,/^(?::[^#\n;]+)/i,/^(?::)/i,/^(?:$)/i,/^(?:.)/i],conditions:{acc_descr_multiline:{rules:[12,13],inclusive:!1},acc_descr:{rules:[10],inclusive:!1},acc_title:{rules:[8],inclusive:!1},INITIAL:{rules:[0,1,2,3,4,5,6,7,9,11,14,15,16,17,18,19],inclusive:!0}}};return h}();k.lexer=b;function _(){this.yy={}}return A(_,"Parser"),_.prototype=k,k.Parser=_,new _}();nt.parser=nt;var $t=nt,Y="",at=[],q=[],X=[],Mt=A(function(){at.length=0,q.length=0,Y="",X.length=0,C()},"clear"),Et=A(function(e){Y=e,at.push(e)},"addSection"),Ct=A(function(){return at},"getSections"),Pt=A(function(){let e=dt(),r=100,a=0;while(!e&&a<r)e=dt(),a++;return q.push(...X),q},"getTasks"),It=A(function(){let e=[];return q.forEach((a)=>{if(a.people)e.push(...a.people)}),[...new Set(e)].sort()},"updateActors"),At=A(function(e,r){let a=r.substr(1).split(":"),m=0,i=[];if(a.length===1)m=Number(a[0]),i=[];else m=Number(a[0]),i=a[1].split(",");let y=i.map((o)=>o.trim()),x={section:Y,type:Y,people:y,task:e,score:m};X.push(x)},"addTask"),Ft=A(function(e){let r={section:Y,type:Y,description:e,task:e,classes:[]};q.push(r)},"addTaskOrg"),dt=A(function(){let e=A(function(a){return X[a].processed},"compileTask"),r=!0;for(let[a,m]of X.entries())e(a),r=r&&m.processed;return r},"compileTasks"),Vt=A(function(){return It()},"getActors"),ft={getConfig:A(()=>t().journey,"getConfig"),clear:Mt,setDiagramTitle:p,getDiagramTitle:Q,setAccTitle:B,getAccTitle:E,setAccDescription:d,getAccDescription:I,addSection:Et,getSections:Ct,getTasks:Pt,addTask:At,addTaskOrg:Ft,getActors:Vt},Rt=A((e)=>`.label {
    font-family: ${e.fontFamily};
    color: ${e.textColor};
  }
  .mouth {
    stroke: #666;
  }

  line {
    stroke: ${e.textColor}
  }

  .legend {
    fill: ${e.textColor};
    font-family: ${e.fontFamily};
  }

  .label text {
    fill: #333;
  }
  .label {
    color: ${e.textColor}
  }

  .face {
    ${e.faceColor?`fill: ${e.faceColor}`:"fill: #FFF8DC"};
    stroke: #999;
  }

  .node rect,
  .node circle,
  .node ellipse,
  .node polygon,
  .node path {
    fill: ${e.mainBkg};
    stroke: ${e.nodeBorder};
    stroke-width: 1px;
  }

  .node .label {
    text-align: center;
  }
  .node.clickable {
    cursor: pointer;
  }

  .arrowheadPath {
    fill: ${e.arrowheadColor};
  }

  .edgePaths .path {
    stroke: ${e.lineColor};
    stroke-width: 1.5px;
  }

  .flowchart-link {
    stroke: ${e.lineColor};
    fill: none;
  }

  .edgeLabel {
    background-color: ${e.edgeLabelBackground};
    rect {
      opacity: 0.5;
    }
    text-align: center;
  }

  .cluster rect {
  }

  .cluster text {
    fill: ${e.titleColor};
  }

  div.mermaidTooltip {
    position: absolute;
    text-align: center;
    max-width: 200px;
    padding: 2px;
    font-family: ${e.fontFamily};
    font-size: 12px;
    background: ${e.tertiaryColor};
    border: 1px solid ${e.border2};
    border-radius: 2px;
    pointer-events: none;
    z-index: 100;
  }

  .task-type-0, .section-type-0  {
    ${e.fillType0?`fill: ${e.fillType0}`:""};
  }
  .task-type-1, .section-type-1  {
    ${e.fillType0?`fill: ${e.fillType1}`:""};
  }
  .task-type-2, .section-type-2  {
    ${e.fillType0?`fill: ${e.fillType2}`:""};
  }
  .task-type-3, .section-type-3  {
    ${e.fillType0?`fill: ${e.fillType3}`:""};
  }
  .task-type-4, .section-type-4  {
    ${e.fillType0?`fill: ${e.fillType4}`:""};
  }
  .task-type-5, .section-type-5  {
    ${e.fillType0?`fill: ${e.fillType5}`:""};
  }
  .task-type-6, .section-type-6  {
    ${e.fillType0?`fill: ${e.fillType6}`:""};
  }
  .task-type-7, .section-type-7  {
    ${e.fillType0?`fill: ${e.fillType7}`:""};
  }

  .actor-0 {
    ${e.actor0?`fill: ${e.actor0}`:""};
  }
  .actor-1 {
    ${e.actor1?`fill: ${e.actor1}`:""};
  }
  .actor-2 {
    ${e.actor2?`fill: ${e.actor2}`:""};
  }
  .actor-3 {
    ${e.actor3?`fill: ${e.actor3}`:""};
  }
  .actor-4 {
    ${e.actor4?`fill: ${e.actor4}`:""};
  }
  .actor-5 {
    ${e.actor5?`fill: ${e.actor5}`:""};
  }
  ${EA()}
`,"getStyles"),Lt=Rt,lt=A(function(e,r){return re(e,r)},"drawRect"),Bt=A(function(e,r){let m=e.append("circle").attr("cx",r.cx).attr("cy",r.cy).attr("class","face").attr("r",15).attr("stroke-width",2).attr("overflow","visible"),i=e.append("g");i.append("circle").attr("cx",r.cx-5).attr("cy",r.cy-5).attr("r",1.5).attr("stroke-width",2).attr("fill","#666").attr("stroke","#666"),i.append("circle").attr("cx",r.cx+5).attr("cy",r.cy-5).attr("r",1.5).attr("stroke-width",2).attr("fill","#666").attr("stroke","#666");function y(k){let b=vA().startAngle(Math.PI/2).endAngle(3*(Math.PI/2)).innerRadius(7.5).outerRadius(6.8181818181818175);k.append("path").attr("class","mouth").attr("d",b).attr("transform","translate("+r.cx+","+(r.cy+2)+")")}A(y,"smile");function x(k){let b=vA().startAngle(3*Math.PI/2).endAngle(5*(Math.PI/2)).innerRadius(7.5).outerRadius(6.8181818181818175);k.append("path").attr("class","mouth").attr("d",b).attr("transform","translate("+r.cx+","+(r.cy+7)+")")}A(x,"sad");function o(k){k.append("line").attr("class","mouth").attr("stroke",2).attr("x1",r.cx-5).attr("y1",r.cy+7).attr("x2",r.cx+5).attr("y2",r.cy+7).attr("class","mouth").attr("stroke-width","1px").attr("stroke","#666")}if(A(o,"ambivalent"),r.score>3)y(i);else if(r.score<3)x(i);else o(i);return m},"drawFace"),mt=A(function(e,r){let a=e.append("circle");if(a.attr("cx",r.cx),a.attr("cy",r.cy),a.attr("class","actor-"+r.pos),a.attr("fill",r.fill),a.attr("stroke",r.stroke),a.attr("r",r.r),a.class!==void 0)a.attr("class",a.class);if(r.title!==void 0)a.append("title").text(r.title);return a},"drawCircle"),xt=A(function(e,r){return Qi(e,r)},"drawText"),jt=A(function(e,r){function a(i,y,x,o,k){return i+","+y+" "+(i+x)+","+y+" "+(i+x)+","+(y+o-k)+" "+(i+x-k*1.2)+","+(y+o)+" "+i+","+(y+o)}A(a,"genPoints");let m=e.append("polygon");m.attr("points",a(r.x,r.y,50,20,7)),m.attr("class","labelBox"),r.y=r.y+r.labelMargin,r.x=r.x+0.5*r.labelMargin,xt(e,r)},"drawLabel"),Nt=A(function(e,r,a){let m=e.append("g"),i=cA();i.x=r.x,i.y=r.y,i.fill=r.fill,i.width=a.width*r.taskCount+a.diagramMarginX*(r.taskCount-1),i.height=a.height,i.class="journey-section section-type-"+r.num,i.rx=3,i.ry=3,lt(m,i),kt(a)(r.text,m,i.x,i.y,i.width,i.height,{class:"journey-section section-type-"+r.num},a,r.colour)},"drawSection"),st=-1,zt=A(function(e,r,a,m){let i=r.x+a.width/2,y=e.append("g");st++;let x=450;y.append("line").attr("id",m+"-task"+st).attr("x1",i).attr("y1",r.y).attr("x2",i).attr("y2",x).attr("class","task-line").attr("stroke-width","1px").attr("stroke-dasharray","4 2").attr("stroke","#666"),Bt(y,{cx:i,cy:300+(5-r.score)*30,score:r.score});let o=cA();o.x=r.x,o.y=r.y,o.fill=r.fill,o.width=a.width,o.height=a.height,o.class="task task-type-"+r.num,o.rx=3,o.ry=3,lt(y,o);let k=r.x+14;r.people.forEach((b)=>{let _=r.actors[b].color,h={cx:k,cy:r.y,r:7,fill:_,stroke:"#000",title:b,pos:r.actors[b].position};mt(y,h),k+=10}),kt(a)(r.task,y,o.x,o.y,o.width,o.height,{class:"task"},a,r.colour)},"drawTask"),Wt=A(function(e,r){bt(e,r)},"drawBackgroundRect"),kt=function(){function e(i,y,x,o,k,b,_,h){let n=y.append("text").attr("x",x+k/2).attr("y",o+b/2+5).style("font-color",h).style("text-anchor","middle").text(i);m(n,_)}A(e,"byText");function r(i,y,x,o,k,b,_,h,n){let{taskFontSize:s,taskFontFamily:l}=h,f=i.split(/<br\s*\/?>/gi);for(let g=0;g<f.length;g++){let c=g*s-s*(f.length-1)/2,T=y.append("text").attr("x",x+k/2).attr("y",o).attr("fill",n).style("text-anchor","middle").style("font-size",s).style("font-family",l);T.append("tspan").attr("x",x+k/2).attr("dy",c).text(f[g]),T.attr("y",o+b/2).attr("dominant-baseline","central").attr("alignment-baseline","central"),m(T,_)}}A(r,"byTspan");function a(i,y,x,o,k,b,_,h){let n=y.append("switch"),l=n.append("foreignObject").attr("x",x).attr("y",o).attr("width",k).attr("height",b).attr("position","fixed").append("xhtml:div").style("display","table").style("height","100%").style("width","100%");l.append("div").attr("class","label").style("display","table-cell").style("text-align","center").style("vertical-align","middle").text(i),r(i,n,x,o,k,b,_,h),m(l,_)}A(a,"byFo");function m(i,y){for(let x in y)if(x in y)i.attr(x,y[x])}return A(m,"_setTextAttrs"),function(i){return i.textPlacement==="fo"?a:i.textPlacement==="old"?e:r}}(),Ot=A(function(e,r){st=-1,e.append("defs").append("marker").attr("id",r+"-arrowhead").attr("refX",5).attr("refY",2).attr("markerWidth",6).attr("markerHeight",4).attr("orient","auto").append("path").attr("d","M 0,0 V 4 L6,2 Z")},"initGraphics"),G={drawRect:lt,drawCircle:mt,drawSection:Nt,drawText:xt,drawLabel:jt,drawTask:zt,drawBackgroundRect:Wt,initGraphics:Ot},Yt=A(function(e){Object.keys(e).forEach(function(a){V[a]=e[a]})},"setConf"),L={},Z=0;function _t(e){let r=t().journey,a=r.maxLabelWidth;Z=0;let m=60;Object.keys(L).forEach((i)=>{let y=L[i].color,x={cx:20,cy:m,r:7,fill:y,stroke:"#000",pos:L[i].position};G.drawCircle(e,x);let o=e.append("text").attr("visibility","hidden").text(i),k=o.node().getBoundingClientRect().width;o.remove();let b=[];if(k<=a)b=[i];else{let _=i.split(" "),h="";if(o=e.append("text").attr("visibility","hidden"),_.forEach((n)=>{let s=h?`${h} ${n}`:n;if(o.text(s),o.node().getBoundingClientRect().width>a){if(h)b.push(h);if(h=n,o.text(n),o.node().getBoundingClientRect().width>a){let f="";for(let g of n)if(f+=g,o.text(f+"-"),o.node().getBoundingClientRect().width>a)b.push(f.slice(0,-1)+"-"),f=g;h=f}}else h=s}),h)b.push(h);o.remove()}b.forEach((_,h)=>{let n={x:40,y:m+7+h*20,fill:"#666",text:_,textMargin:r.boxTextMargin??5},l=G.drawText(e,n).node().getBoundingClientRect().width;if(l>Z&&l>r.leftMargin-l)Z=l}),m+=Math.max(20,b.length*20)})}A(_t,"drawActorLegend");var V=t().journey,N=0,qt=A(function(e,r,a,m){let i=t(),y=i.journey.titleColor,x=i.journey.titleFontSize,o=i.journey.titleFontFamily,k=i.securityLevel,b;if(k==="sandbox")b=u("#i"+r);let _=k==="sandbox"?u(b.nodes()[0].contentDocument.body):u("body");F.init();let h=_.select("#"+r);G.initGraphics(h,r);let n=m.db.getTasks(),s=m.db.getDiagramTitle(),l=m.db.getActors();for(let j in L)delete L[j];let f=0;l.forEach((j)=>{L[j]={color:V.actorColours[f%V.actorColours.length],position:f},f++}),_t(h),N=V.leftMargin+Z,F.insert(0,0,N,Object.keys(L).length*50),Xt(h,n,0,r);let g=F.getBounds();if(s)h.append("text").text(s).attr("x",N).attr("font-size",x).attr("font-weight","bold").attr("y",25).attr("fill",y).attr("font-family",o);let c=g.stopy-g.starty+2*V.diagramMarginY,T=N+g.stopx+2*V.diagramMarginX;D(h,c,T,V.useMaxWidth),h.append("line").attr("x1",N).attr("y1",V.height*4).attr("x2",T-N-4).attr("y2",V.height*4).attr("stroke-width",4).attr("stroke","black").attr("marker-end","url(#"+r+"-arrowhead)");let v=s?70:0;h.attr("viewBox",`${g.startx} -25 ${T} ${c+v}`),h.attr("preserveAspectRatio","xMinYMin meet"),h.attr("height",c+v+25)},"draw"),F={data:{startx:void 0,stopx:void 0,starty:void 0,stopy:void 0},verticalPos:0,sequenceItems:[],init:A(function(){this.sequenceItems=[],this.data={startx:void 0,stopx:void 0,starty:void 0,stopy:void 0},this.verticalPos=0},"init"),updateVal:A(function(e,r,a,m){if(e[r]===void 0)e[r]=a;else e[r]=m(a,e[r])},"updateVal"),updateBounds:A(function(e,r,a,m){let i=t().journey,y=this,x=0;function o(k){return A(function(_){x++;let h=y.sequenceItems.length-x+1;if(y.updateVal(_,"starty",r-h*i.boxMargin,Math.min),y.updateVal(_,"stopy",m+h*i.boxMargin,Math.max),y.updateVal(F.data,"startx",e-h*i.boxMargin,Math.min),y.updateVal(F.data,"stopx",a+h*i.boxMargin,Math.max),k!=="activation")y.updateVal(_,"startx",e-h*i.boxMargin,Math.min),y.updateVal(_,"stopx",a+h*i.boxMargin,Math.max),y.updateVal(F.data,"starty",r-h*i.boxMargin,Math.min),y.updateVal(F.data,"stopy",m+h*i.boxMargin,Math.max)},"updateItemBounds")}A(o,"updateFn"),this.sequenceItems.forEach(o())},"updateBounds"),insert:A(function(e,r,a,m){let i=Math.min(e,a),y=Math.max(e,a),x=Math.min(r,m),o=Math.max(r,m);this.updateVal(F.data,"startx",i,Math.min),this.updateVal(F.data,"starty",x,Math.min),this.updateVal(F.data,"stopx",y,Math.max),this.updateVal(F.data,"stopy",o,Math.max),this.updateBounds(i,x,y,o)},"insert"),bumpVerticalPos:A(function(e){this.verticalPos=this.verticalPos+e,this.data.stopy=this.verticalPos},"bumpVerticalPos"),getVerticalPos:A(function(){return this.verticalPos},"getVerticalPos"),getBounds:A(function(){return this.data},"getBounds")},{sectionFills:it,sectionColours:pt}=V,Xt=A(function(e,r,a,m){let i=t().journey,y="",x=i.height*2+i.diagramMarginY,o=a+x,k=0,b="#CCC",_="black",h=0;for(let[n,s]of r.entries()){if(y!==s.section){b=it[k%it.length],h=k%it.length,_=pt[k%pt.length];let f=0,g=s.section;for(let T=n;T<r.length;T++)if(r[T].section==g)f=f+1;else break;let c={x:n*i.taskMargin+n*i.width+N,y:50,text:s.section,fill:b,num:h,colour:_,taskCount:f};G.drawSection(e,c,i),y=s.section,k++}let l=s.people.reduce((f,g)=>{if(L[g])f[g]=L[g];return f},{});s.x=n*i.taskMargin+n*i.width+N,s.y=o,s.width=i.diagramMarginX,s.height=i.diagramMarginY,s.colour=_,s.fill=b,s.num=h,s.actors=l,G.drawTask(e,s,i,m),F.insert(s.x,s.y,s.x+s.width+i.taskMargin,450)}},"drawTasks"),gt={setConf:Yt,draw:qt},te={parser:$t,db:ft,renderer:gt,styles:Lt,init:A((e)=>{gt.setConf(e.journey),ft.clear()},"init")};export{te as diagram};
