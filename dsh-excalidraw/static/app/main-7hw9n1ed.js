import{A,e,iA,s,C,B,E,d,I,p,Q,t,u,li,m,oA}from"./main-cbwdhkyr.js";import{Ce}from"./main-60ct9382.js";import{rA}from"./main-nq48r09f.js";import{W}from"./main-p126yep5.js";var Bt=function(){var r=A(function(Z,l,g,o){for(g=g||{},o=Z.length;o--;g[Z[o]]=l);return g},"o"),i=[1,2],f=[1,3],a=[1,4],S=[2,4],y=[1,9],b=[1,11],_=[1,16],h=[1,17],v=[1,18],L=[1,19],M=[1,33],Y=[1,20],O=[1,21],T=[1,22],G=[1,23],H=[1,24],F=[1,26],z=[1,27],P=[1,28],K=[1,29],V=[1,30],rt=[1,31],St=[1,32],yt=[1,35],gt=[1,36],Tt=[1,37],bt=[1,38],it=[1,34],k=[1,4,5,16,17,19,21,22,24,25,26,27,28,29,33,35,37,38,41,45,48,51,52,53,54,57],Et=[1,4,5,14,15,16,17,19,21,22,24,25,26,27,28,29,33,35,37,38,39,40,41,45,48,51,52,53,54,57],Vt=[4,5,16,17,19,21,22,24,25,26,27,28,29,33,35,37,38,41,45,48,51,52,53,54,57],It={trace:A(function(){},"trace"),yy:{},symbols_:{error:2,start:3,SPACE:4,NL:5,SD:6,document:7,line:8,statement:9,classDefStatement:10,styleStatement:11,cssClassStatement:12,idStatement:13,DESCR:14,"-->":15,HIDE_EMPTY:16,scale:17,WIDTH:18,COMPOSIT_STATE:19,STRUCT_START:20,STRUCT_STOP:21,STATE_DESCR:22,AS:23,ID:24,FORK:25,JOIN:26,CHOICE:27,CONCURRENT:28,note:29,notePosition:30,NOTE_TEXT:31,direction:32,acc_title:33,acc_title_value:34,acc_descr:35,acc_descr_value:36,acc_descr_multiline_value:37,CLICK:38,STRING:39,HREF:40,classDef:41,CLASSDEF_ID:42,CLASSDEF_STYLEOPTS:43,DEFAULT:44,style:45,STYLE_IDS:46,STYLEDEF_STYLEOPTS:47,class:48,CLASSENTITY_IDS:49,STYLECLASS:50,direction_tb:51,direction_bt:52,direction_rl:53,direction_lr:54,eol:55,";":56,EDGE_STATE:57,STYLE_SEPARATOR:58,left_of:59,right_of:60,$accept:0,$end:1},terminals_:{2:"error",4:"SPACE",5:"NL",6:"SD",14:"DESCR",15:"-->",16:"HIDE_EMPTY",17:"scale",18:"WIDTH",19:"COMPOSIT_STATE",20:"STRUCT_START",21:"STRUCT_STOP",22:"STATE_DESCR",23:"AS",24:"ID",25:"FORK",26:"JOIN",27:"CHOICE",28:"CONCURRENT",29:"note",31:"NOTE_TEXT",33:"acc_title",34:"acc_title_value",35:"acc_descr",36:"acc_descr_value",37:"acc_descr_multiline_value",38:"CLICK",39:"STRING",40:"HREF",41:"classDef",42:"CLASSDEF_ID",43:"CLASSDEF_STYLEOPTS",44:"DEFAULT",45:"style",46:"STYLE_IDS",47:"STYLEDEF_STYLEOPTS",48:"class",49:"CLASSENTITY_IDS",50:"STYLECLASS",51:"direction_tb",52:"direction_bt",53:"direction_rl",54:"direction_lr",56:";",57:"EDGE_STATE",58:"STYLE_SEPARATOR",59:"left_of",60:"right_of"},productions_:[0,[3,2],[3,2],[3,2],[7,0],[7,2],[8,2],[8,1],[8,1],[9,1],[9,1],[9,1],[9,1],[9,2],[9,3],[9,4],[9,1],[9,2],[9,1],[9,4],[9,3],[9,6],[9,1],[9,1],[9,1],[9,1],[9,4],[9,4],[9,1],[9,2],[9,2],[9,1],[9,5],[9,5],[10,3],[10,3],[11,3],[12,3],[32,1],[32,1],[32,1],[32,1],[55,1],[55,1],[13,1],[13,1],[13,3],[13,3],[30,1],[30,1]],performAction:A(function(l,g,o,D,x,n,at){var c=n.length-1;switch(x){case 3:return D.setRootDoc(n[c]),n[c];break;case 4:this.$=[];break;case 5:if(n[c]!="nl")n[c-1].push(n[c]),this.$=n[c-1];break;case 6:case 7:this.$=n[c];break;case 8:this.$="nl";break;case 12:this.$=n[c];break;case 13:let _t=n[c-1];_t.description=D.trimColon(n[c]),this.$=_t;break;case 14:this.$={stmt:"relation",state1:n[c-2],state2:n[c]};break;case 15:let Dt=D.trimColon(n[c]);this.$={stmt:"relation",state1:n[c-3],state2:n[c-1],description:Dt};break;case 19:this.$={stmt:"state",id:n[c-3],type:"default",description:"",doc:n[c-1]};break;case 20:var X=n[c],J=n[c-2].trim();if(n[c].match(":")){var ct=n[c].split(":");X=ct[0],J=[J,ct[1]]}this.$={stmt:"state",id:X,type:"default",description:J};break;case 21:this.$={stmt:"state",id:n[c-3],type:"default",description:n[c-5],doc:n[c-1]};break;case 22:this.$={stmt:"state",id:n[c],type:"fork"};break;case 23:this.$={stmt:"state",id:n[c],type:"join"};break;case 24:this.$={stmt:"state",id:n[c],type:"choice"};break;case 25:this.$={stmt:"state",id:D.getDividerId(),type:"divider"};break;case 26:this.$={stmt:"state",id:n[c-1].trim(),note:{position:n[c-2].trim(),text:n[c].trim()}};break;case 29:this.$=n[c].trim(),D.setAccTitle(this.$);break;case 30:case 31:this.$=n[c].trim(),D.setAccDescription(this.$);break;case 32:this.$={stmt:"click",id:n[c-3],url:n[c-2],tooltip:n[c-1]};break;case 33:this.$={stmt:"click",id:n[c-3],url:n[c-1],tooltip:""};break;case 34:case 35:this.$={stmt:"classDef",id:n[c-1].trim(),classes:n[c].trim()};break;case 36:this.$={stmt:"style",id:n[c-1].trim(),styleClass:n[c].trim()};break;case 37:this.$={stmt:"applyClass",id:n[c-1].trim(),styleClass:n[c].trim()};break;case 38:D.setDirection("TB"),this.$={stmt:"dir",value:"TB"};break;case 39:D.setDirection("BT"),this.$={stmt:"dir",value:"BT"};break;case 40:D.setDirection("RL"),this.$={stmt:"dir",value:"RL"};break;case 41:D.setDirection("LR"),this.$={stmt:"dir",value:"LR"};break;case 44:case 45:this.$={stmt:"state",id:n[c].trim(),type:"default",description:""};break;case 46:this.$={stmt:"state",id:n[c-2].trim(),classes:[n[c].trim()],type:"default",description:""};break;case 47:this.$={stmt:"state",id:n[c-2].trim(),classes:[n[c].trim()],type:"default",description:""};break}},"anonymous"),table:[{3:1,4:i,5:f,6:a},{1:[3]},{3:5,4:i,5:f,6:a},{3:6,4:i,5:f,6:a},r([1,4,5,16,17,19,22,24,25,26,27,28,29,33,35,37,38,41,45,48,51,52,53,54,57],S,{7:7}),{1:[2,1]},{1:[2,2]},{1:[2,3],4:y,5:b,8:8,9:10,10:12,11:13,12:14,13:15,16:_,17:h,19:v,22:L,24:M,25:Y,26:O,27:T,28:G,29:H,32:25,33:F,35:z,37:P,38:K,41:V,45:rt,48:St,51:yt,52:gt,53:Tt,54:bt,57:it},r(k,[2,5]),{9:39,10:12,11:13,12:14,13:15,16:_,17:h,19:v,22:L,24:M,25:Y,26:O,27:T,28:G,29:H,32:25,33:F,35:z,37:P,38:K,41:V,45:rt,48:St,51:yt,52:gt,53:Tt,54:bt,57:it},r(k,[2,7]),r(k,[2,8]),r(k,[2,9]),r(k,[2,10]),r(k,[2,11]),r(k,[2,12],{14:[1,40],15:[1,41]}),r(k,[2,16]),{18:[1,42]},r(k,[2,18],{20:[1,43]}),{23:[1,44]},r(k,[2,22]),r(k,[2,23]),r(k,[2,24]),r(k,[2,25]),{30:45,31:[1,46],59:[1,47],60:[1,48]},r(k,[2,28]),{34:[1,49]},{36:[1,50]},r(k,[2,31]),{13:51,24:M,57:it},{42:[1,52],44:[1,53]},{46:[1,54]},{49:[1,55]},r(Et,[2,44],{58:[1,56]}),r(Et,[2,45],{58:[1,57]}),r(k,[2,38]),r(k,[2,39]),r(k,[2,40]),r(k,[2,41]),r(k,[2,6]),r(k,[2,13]),{13:58,24:M,57:it},r(k,[2,17]),r(Vt,S,{7:59}),{24:[1,60]},{24:[1,61]},{23:[1,62]},{24:[2,48]},{24:[2,49]},r(k,[2,29]),r(k,[2,30]),{39:[1,63],40:[1,64]},{43:[1,65]},{43:[1,66]},{47:[1,67]},{50:[1,68]},{24:[1,69]},{24:[1,70]},r(k,[2,14],{14:[1,71]}),{4:y,5:b,8:8,9:10,10:12,11:13,12:14,13:15,16:_,17:h,19:v,21:[1,72],22:L,24:M,25:Y,26:O,27:T,28:G,29:H,32:25,33:F,35:z,37:P,38:K,41:V,45:rt,48:St,51:yt,52:gt,53:Tt,54:bt,57:it},r(k,[2,20],{20:[1,73]}),{31:[1,74]},{24:[1,75]},{39:[1,76]},{39:[1,77]},r(k,[2,34]),r(k,[2,35]),r(k,[2,36]),r(k,[2,37]),r(Et,[2,46]),r(Et,[2,47]),r(k,[2,15]),r(k,[2,19]),r(Vt,S,{7:78}),r(k,[2,26]),r(k,[2,27]),{5:[1,79]},{5:[1,80]},{4:y,5:b,8:8,9:10,10:12,11:13,12:14,13:15,16:_,17:h,19:v,21:[1,81],22:L,24:M,25:Y,26:O,27:T,28:G,29:H,32:25,33:F,35:z,37:P,38:K,41:V,45:rt,48:St,51:yt,52:gt,53:Tt,54:bt,57:it},r(k,[2,32]),r(k,[2,33]),r(k,[2,21])],defaultActions:{5:[2,1],6:[2,2],47:[2,48],48:[2,49]},parseError:A(function(l,g){if(g.recoverable)this.trace(l);else{var o=Error(l);throw o.hash=g,o}},"parseError"),parse:A(function(l){var g=this,o=[0],D=[],x=[null],n=[],at=this.table,c="",X=0,J=0,ct=0,_t=2,Dt=1,ue=n.slice.call(arguments,1),w=Object.create(this.lexer),et={yy:{}};for(var wt in this.yy)if(Object.prototype.hasOwnProperty.call(this.yy,wt))et.yy[wt]=this.yy[wt];if(w.setInput(l,et.yy),et.yy.lexer=w,et.yy.parser=this,typeof w.yylloc>"u")w.yylloc={};var Ot=w.yylloc;n.push(Ot);var de=w.options&&w.options.ranges;if(typeof et.yy.parseError==="function")this.parseError=et.yy.parseError;else this.parseError=Object.getPrototypeOf(this).parseError;function fe(j){o.length=o.length-2*j,x.length=x.length-j,n.length=n.length-j}A(fe,"popStack");function Mt(){var j=D.pop()||w.lex()||Dt;if(typeof j!=="number"){if(j instanceof Array)D=j,j=D.pop();j=g.symbols_[j]||j}return j}A(Mt,"lex");var N,Nt,st,U,Ge,Rt,nt={},vt,q,Ut,Ct;while(!0){if(st=o[o.length-1],this.defaultActions[st])U=this.defaultActions[st];else{if(N===null||typeof N>"u")N=Mt();U=at[st]&&at[st][N]}if(typeof U>"u"||!U.length||!U[0]){var $t="";Ct=[];for(vt in at[st])if(this.terminals_[vt]&&vt>_t)Ct.push("'"+this.terminals_[vt]+"'");if(w.showPosition)$t="Parse error on line "+(X+1)+`:
`+w.showPosition()+`
Expecting `+Ct.join(", ")+", got '"+(this.terminals_[N]||N)+"'";else $t="Parse error on line "+(X+1)+": Unexpected "+(N==Dt?"end of input":"'"+(this.terminals_[N]||N)+"'");this.parseError($t,{text:w.match,token:this.terminals_[N]||N,line:w.yylineno,loc:Ot,expected:Ct})}if(U[0]instanceof Array&&U.length>1)throw Error("Parse Error: multiple actions possible at state: "+st+", token: "+N);switch(U[0]){case 1:if(o.push(N),x.push(w.yytext),n.push(w.yylloc),o.push(U[1]),N=null,!Nt){if(J=w.yyleng,c=w.yytext,X=w.yylineno,Ot=w.yylloc,ct>0)ct--}else N=Nt,Nt=null;break;case 2:if(q=this.productions_[U[1]][1],nt.$=x[x.length-q],nt._$={first_line:n[n.length-(q||1)].first_line,last_line:n[n.length-1].last_line,first_column:n[n.length-(q||1)].first_column,last_column:n[n.length-1].last_column},de)nt._$.range=[n[n.length-(q||1)].range[0],n[n.length-1].range[1]];if(Rt=this.performAction.apply(nt,[c,J,X,et.yy,U[1],x,n].concat(ue)),typeof Rt<"u")return Rt;if(q)o=o.slice(0,-1*q*2),x=x.slice(0,-1*q),n=n.slice(0,-1*q);o.push(this.productions_[U[1]][0]),x.push(nt.$),n.push(nt._$),Ut=at[o[o.length-2]][o[o.length-1]],o.push(Ut);break;case 3:return!0}}return!0},"parse")},he=function(){var Z={EOF:1,parseError:A(function(g,o){if(this.yy.parser)this.yy.parser.parseError(g,o);else throw Error(g)},"parseError"),setInput:A(function(l,g){if(this.yy=g||this.yy||{},this._input=l,this._more=this._backtrack=this.done=!1,this.yylineno=this.yyleng=0,this.yytext=this.matched=this.match="",this.conditionStack=["INITIAL"],this.yylloc={first_line:1,first_column:0,last_line:1,last_column:0},this.options.ranges)this.yylloc.range=[0,0];return this.offset=0,this},"setInput"),input:A(function(){var l=this._input[0];this.yytext+=l,this.yyleng++,this.offset++,this.match+=l,this.matched+=l;var g=l.match(/(?:\r\n?|\n).*/g);if(g)this.yylineno++,this.yylloc.last_line++;else this.yylloc.last_column++;if(this.options.ranges)this.yylloc.range[1]++;return this._input=this._input.slice(1),l},"input"),unput:A(function(l){var g=l.length,o=l.split(/(?:\r\n?|\n)/g);this._input=l+this._input,this.yytext=this.yytext.substr(0,this.yytext.length-g),this.offset-=g;var D=this.match.split(/(?:\r\n?|\n)/g);if(this.match=this.match.substr(0,this.match.length-1),this.matched=this.matched.substr(0,this.matched.length-1),o.length-1)this.yylineno-=o.length-1;var x=this.yylloc.range;if(this.yylloc={first_line:this.yylloc.first_line,last_line:this.yylineno+1,first_column:this.yylloc.first_column,last_column:o?(o.length===D.length?this.yylloc.first_column:0)+D[D.length-o.length].length-o[0].length:this.yylloc.first_column-g},this.options.ranges)this.yylloc.range=[x[0],x[0]+this.yyleng-g];return this.yyleng=this.yytext.length,this},"unput"),more:A(function(){return this._more=!0,this},"more"),reject:A(function(){if(this.options.backtrack_lexer)this._backtrack=!0;else return this.parseError("Lexical error on line "+(this.yylineno+1)+`. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).
`+this.showPosition(),{text:"",token:null,line:this.yylineno});return this},"reject"),less:A(function(l){this.unput(this.match.slice(l))},"less"),pastInput:A(function(){var l=this.matched.substr(0,this.matched.length-this.match.length);return(l.length>20?"...":"")+l.substr(-20).replace(/\n/g,"")},"pastInput"),upcomingInput:A(function(){var l=this.match;if(l.length<20)l+=this._input.substr(0,20-l.length);return(l.substr(0,20)+(l.length>20?"...":"")).replace(/\n/g,"")},"upcomingInput"),showPosition:A(function(){var l=this.pastInput(),g=Array(l.length+1).join("-");return l+this.upcomingInput()+`
`+g+"^"},"showPosition"),test_match:A(function(l,g){var o,D,x;if(this.options.backtrack_lexer){if(x={yylineno:this.yylineno,yylloc:{first_line:this.yylloc.first_line,last_line:this.last_line,first_column:this.yylloc.first_column,last_column:this.yylloc.last_column},yytext:this.yytext,match:this.match,matches:this.matches,matched:this.matched,yyleng:this.yyleng,offset:this.offset,_more:this._more,_input:this._input,yy:this.yy,conditionStack:this.conditionStack.slice(0),done:this.done},this.options.ranges)x.yylloc.range=this.yylloc.range.slice(0)}if(D=l[0].match(/(?:\r\n?|\n).*/g),D)this.yylineno+=D.length;if(this.yylloc={first_line:this.yylloc.last_line,last_line:this.yylineno+1,first_column:this.yylloc.last_column,last_column:D?D[D.length-1].length-D[D.length-1].match(/\r?\n?/)[0].length:this.yylloc.last_column+l[0].length},this.yytext+=l[0],this.match+=l[0],this.matches=l,this.yyleng=this.yytext.length,this.options.ranges)this.yylloc.range=[this.offset,this.offset+=this.yyleng];if(this._more=!1,this._backtrack=!1,this._input=this._input.slice(l[0].length),this.matched+=l[0],o=this.performAction.call(this,this.yy,this,g,this.conditionStack[this.conditionStack.length-1]),this.done&&this._input)this.done=!1;if(o)return o;else if(this._backtrack){for(var n in x)this[n]=x[n];return!1}return!1},"test_match"),next:A(function(){if(this.done)return this.EOF;if(!this._input)this.done=!0;var l,g,o,D;if(!this._more)this.yytext="",this.match="";var x=this._currentRules();for(var n=0;n<x.length;n++)if(o=this._input.match(this.rules[x[n]]),o&&(!g||o[0].length>g[0].length)){if(g=o,D=n,this.options.backtrack_lexer)if(l=this.test_match(o,x[n]),l!==!1)return l;else if(this._backtrack){g=!1;continue}else return!1;else if(!this.options.flex)break}if(g){if(l=this.test_match(g,x[D]),l!==!1)return l;return!1}if(this._input==="")return this.EOF;else return this.parseError("Lexical error on line "+(this.yylineno+1)+`. Unrecognized text.
`+this.showPosition(),{text:"",token:null,line:this.yylineno})},"next"),lex:A(function(){var g=this.next();if(g)return g;else return this.lex()},"lex"),begin:A(function(g){this.conditionStack.push(g)},"begin"),popState:A(function(){var g=this.conditionStack.length-1;if(g>0)return this.conditionStack.pop();else return this.conditionStack[0]},"popState"),_currentRules:A(function(){if(this.conditionStack.length&&this.conditionStack[this.conditionStack.length-1])return this.conditions[this.conditionStack[this.conditionStack.length-1]].rules;else return this.conditions.INITIAL.rules},"_currentRules"),topState:A(function(g){if(g=this.conditionStack.length-1-Math.abs(g||0),g>=0)return this.conditionStack[g];else return"INITIAL"},"topState"),pushState:A(function(g){this.begin(g)},"pushState"),stateStackSize:A(function(){return this.conditionStack.length},"stateStackSize"),options:{"case-insensitive":!0},performAction:A(function(g,o,D,x){function n(){let c=o.yytext.indexOf("%%");if(c===0)return!1;if(c>0){let X=o.yytext.slice(0,c),J=o.yytext.slice(c);if(J)g.lexer.unput(J);o.yytext=X}return!0}A(n,"processId");var at=x;switch(D){case 0:return 38;case 1:return 40;case 2:return 39;case 3:return 44;case 4:return 51;case 5:return 52;case 6:return 53;case 7:return 54;case 8:return 5;case 9:break;case 10:break;case 11:break;case 12:break;case 13:return this.pushState("SCALE"),17;break;case 14:return 18;case 15:this.popState();break;case 16:return this.begin("acc_title"),33;break;case 17:return this.popState(),"acc_title_value";break;case 18:return this.begin("acc_descr"),35;break;case 19:return this.popState(),"acc_descr_value";break;case 20:this.begin("acc_descr_multiline");break;case 21:this.popState();break;case 22:return"acc_descr_multiline_value";case 23:return this.pushState("CLASSDEF"),41;break;case 24:return this.popState(),this.pushState("CLASSDEFID"),"DEFAULT_CLASSDEF_ID";break;case 25:return this.popState(),this.pushState("CLASSDEFID"),42;break;case 26:return this.popState(),43;break;case 27:return this.pushState("CLASS"),48;break;case 28:return this.popState(),this.pushState("CLASS_STYLE"),49;break;case 29:return this.popState(),50;break;case 30:return this.pushState("STYLE"),45;break;case 31:return this.popState(),this.pushState("STYLEDEF_STYLES"),46;break;case 32:return this.popState(),47;break;case 33:return this.pushState("SCALE"),17;break;case 34:return 18;case 35:this.popState();break;case 36:this.pushState("STATE");break;case 37:return this.popState(),o.yytext=o.yytext.slice(0,-8).trim(),25;break;case 38:return this.popState(),o.yytext=o.yytext.slice(0,-8).trim(),26;break;case 39:return this.popState(),o.yytext=o.yytext.slice(0,-10).trim(),27;break;case 40:return this.popState(),o.yytext=o.yytext.slice(0,-8).trim(),25;break;case 41:return this.popState(),o.yytext=o.yytext.slice(0,-8).trim(),26;break;case 42:return this.popState(),o.yytext=o.yytext.slice(0,-10).trim(),27;break;case 43:return 51;case 44:return 52;case 45:return 53;case 46:return 54;case 47:this.pushState("STATE_STRING");break;case 48:return this.pushState("STATE_ID"),"AS";break;case 49:if(!n())return;return this.popState(),"ID";break;case 50:this.popState();break;case 51:return"STATE_DESCR";case 52:throw Error('Error: State name must be a single word. Found: "'+o.yytext.trim()+'"');case 53:return 19;case 54:this.popState();break;case 55:return this.popState(),this.pushState("struct"),20;break;case 56:return this.popState(),21;break;case 57:break;case 58:return this.begin("NOTE"),29;break;case 59:return this.popState(),this.pushState("NOTE_ID"),59;break;case 60:return this.popState(),this.pushState("NOTE_ID"),60;break;case 61:this.popState(),this.pushState("FLOATING_NOTE");break;case 62:return this.popState(),this.pushState("FLOATING_NOTE_ID"),"AS";break;case 63:break;case 64:return"NOTE_TEXT";case 65:if(!n())return;return this.popState(),"ID";break;case 66:if(!n())return;return this.popState(),this.pushState("NOTE_TEXT"),24;break;case 67:return this.popState(),o.yytext=o.yytext.substr(2).trim(),31;break;case 68:return this.popState(),o.yytext=o.yytext.slice(0,-8).trim(),31;break;case 69:return 6;case 70:return 6;case 71:return 16;case 72:return 57;case 73:if(!n())return;return 24;case 74:return o.yytext=o.yytext.trim(),14;break;case 75:return 15;case 76:return 28;case 77:return 58;case 78:return 5;case 79:return"INVALID"}},"anonymous"),rules:[/^(?:click\b)/i,/^(?:href\b)/i,/^(?:"[^"]*")/i,/^(?:default\b)/i,/^(?:.*direction\s+TB[^\n]*)/i,/^(?:.*direction\s+BT[^\n]*)/i,/^(?:.*direction\s+RL[^\n]*)/i,/^(?:.*direction\s+LR[^\n]*)/i,/^(?:[\n]+)/i,/^(?:[\s]+)/i,/^(?:((?!\n)\s)+)/i,/^(?:#[^\n]*)/i,/^(?:%%(?!\{)[^\n]*)/i,/^(?:scale\s+)/i,/^(?:\d+)/i,/^(?:\s+width\b)/i,/^(?:accTitle\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*\{\s*)/i,/^(?:[\}])/i,/^(?:[^\}]*)/i,/^(?:classDef\s+)/i,/^(?:DEFAULT\s+)/i,/^(?:\w+\s+)/i,/^(?:[^\n]*)/i,/^(?:class\s+)/i,/^(?:(\w+)+((,\s*\w+)*))/i,/^(?:[^\n]*)/i,/^(?:style\s+)/i,/^(?:[\w,]+\s+)/i,/^(?:[^\n]*)/i,/^(?:scale\s+)/i,/^(?:\d+)/i,/^(?:\s+width\b)/i,/^(?:state\s+)/i,/^(?:.*<<fork>>)/i,/^(?:.*<<join>>)/i,/^(?:.*<<choice>>)/i,/^(?:.*\[\[fork\]\])/i,/^(?:.*\[\[join\]\])/i,/^(?:.*\[\[choice\]\])/i,/^(?:.*direction\s+TB[^\n]*)/i,/^(?:.*direction\s+BT[^\n]*)/i,/^(?:.*direction\s+RL[^\n]*)/i,/^(?:.*direction\s+LR[^\n]*)/i,/^(?:["])/i,/^(?:\s*as\s+)/i,/^(?:[^\n\{]*)/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:\w+\s+\w+.*?\{)/i,/^(?:[^\n\s\{]+)/i,/^(?:\n)/i,/^(?:\{)/i,/^(?:\})/i,/^(?:[\n])/i,/^(?:note\s+)/i,/^(?:left of\b)/i,/^(?:right of\b)/i,/^(?:")/i,/^(?:\s*as\s*)/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:[^\n]*)/i,/^(?:\s*[^:\n\s\-]+)/i,/^(?:\s*:[^:\n;]+)/i,/^(?:[\s\S]*?\n\s*end note\b)/i,/^(?:stateDiagram\s+)/i,/^(?:stateDiagram-v2\s+)/i,/^(?:hide empty description\b)/i,/^(?:\[\*\])/i,/^(?:[^:\n\s\-\{]+)/i,/^(?:\s*:(?:[^:\n;]|:[^:\n;])+)/i,/^(?:-->)/i,/^(?:--)/i,/^(?::::)/i,/^(?:$)/i,/^(?:.)/i],conditions:{LINE:{rules:[10,11,12],inclusive:!1},struct:{rules:[10,11,12,23,27,30,36,43,44,45,46,56,57,58,72,73,74,75,76,77],inclusive:!1},FLOATING_NOTE_ID:{rules:[65],inclusive:!1},FLOATING_NOTE:{rules:[62,63,64],inclusive:!1},NOTE_TEXT:{rules:[67,68],inclusive:!1},NOTE_ID:{rules:[66],inclusive:!1},NOTE:{rules:[59,60,61],inclusive:!1},STYLEDEF_STYLEOPTS:{rules:[],inclusive:!1},STYLEDEF_STYLES:{rules:[32],inclusive:!1},STYLE_IDS:{rules:[],inclusive:!1},STYLE:{rules:[31],inclusive:!1},CLASS_STYLE:{rules:[29],inclusive:!1},CLASS:{rules:[28],inclusive:!1},CLASSDEFID:{rules:[26],inclusive:!1},CLASSDEF:{rules:[24,25],inclusive:!1},acc_descr_multiline:{rules:[21,22],inclusive:!1},acc_descr:{rules:[19],inclusive:!1},acc_title:{rules:[17],inclusive:!1},SCALE:{rules:[14,15,34,35],inclusive:!1},ALIAS:{rules:[],inclusive:!1},STATE_ID:{rules:[49],inclusive:!1},STATE_STRING:{rules:[50,51],inclusive:!1},FORK_STATE:{rules:[],inclusive:!1},STATE:{rules:[10,11,12,37,38,39,40,41,42,47,48,52,53,54,55],inclusive:!1},ID:{rules:[10,11,12],inclusive:!1},INITIAL:{rules:[0,1,2,3,4,5,6,7,8,9,11,12,13,16,18,20,23,27,30,33,36,55,58,69,70,71,72,73,74,75,77,78,79],inclusive:!0}}};return Z}();It.lexer=he;function kt(){this.yy={}}return A(kt,"Parser"),kt.prototype=It,It.Parser=kt,new kt}();Bt.parser=Bt;var ft=Bt,pe="TB",qt="TB",Wt="dir",lt="state",ot="root",Yt="relation",Se="classDef",ye="style",ge="applyClass",dt="default",Qt="divider",Zt="fill:none",te="fill: #333",ee="c",se="markdown",re="normal",Ft="rect",Pt="rectWithTitle",Te="stateStart",be="stateEnd",jt="divider",Ht="roundedWithTitle",Ee="note",me="noteGroup",pt="statediagram",ke="state",_e=`${pt}-${ke}`,ie="transition",De="note",ve="note-edge",Ae=`${ie} ${ve}`,xe=`${pt}-${De}`,Le="cluster",Ie=`${pt}-${Le}`,we="cluster-alt",Oe=`${pt}-${we}`,ae="parent",ne="note",Ne="state",Gt="----",Re=`${Gt}${ne}`,zt=`${Gt}${ae}`,oe=A((r,i=qt)=>{if(!r.doc)return i;let f=i;for(let a of r.doc)if(a.stmt==="dir")f=a.value;return f},"getDir"),$e=A(function(r,i){return i.db.getClasses()},"getClasses"),Fe=A(async function(r,i,f,a){e.info("REF0:"),e.info("Drawing state diagram (v2)",i);let{securityLevel:S,state:y,layout:b}=t();a.db.extract(a.db.getRootDocV2());let _=a.db.getData(),h=rA(i,S);if(_.type=a.type,_.layoutAlgorithm=b,_.nodeSpacing=y?.nodeSpacing||50,_.rankSpacing=y?.rankSpacing||50,t().look==="neo")_.markers=["barbNeo"];else _.markers=["barb"];_.diagramId=i,await oA(_,h);let L=8;try{(typeof a.db.getLinks==="function"?a.db.getLinks():new Map).forEach((Y,O)=>{let T=typeof O==="string"?O:typeof O?.id==="string"?O.id:"",G=_.nodes.find((V)=>V.id===T);if(!T){e.warn("⚠️ Invalid or missing stateId from key:",JSON.stringify(O));return}let H=h.node()?.querySelectorAll("g.node, g.rough-node"),F;if(H?.forEach((V)=>{let rt=V.textContent?.trim();if(V.id===G?.domId||rt===T)F=V}),!F){e.warn("⚠️ Could not find node matching text:",T);return}let z=F.parentNode;if(!z){e.warn("⚠️ Node has no parent, cannot wrap:",T);return}let P=document.createElementNS("http://www.w3.org/2000/svg","a"),K=Y.url.replace(/^"+|"+$/g,"");if(P.setAttributeNS("http://www.w3.org/1999/xlink","xlink:href",K),P.setAttribute("target","_blank"),Y.tooltip){let V=Y.tooltip.replace(/^"+|"+$/g,"");P.setAttribute("title",V),F.setAttribute("title",V)}z.replaceChild(P,F),P.appendChild(F),e.info("\uD83D\uDD17 Wrapped node in <a> tag for:",T,Y.url)})}catch(M){e.error("❌ Error injecting clickable links:",M)}m.insertTitle(h,"statediagramTitleText",y?.titleTopMargin??25,a.db.getDiagramTitle()),W(h,L,pt,y?.useMaxWidth??!0)},"draw"),hi={getClasses:$e,draw:Fe,getDir:oe},xt=new Map,tt=0;function Lt(r="",i=0,f="",a=Gt){let S=f!==null&&f.length>0?`${a}${f}`:"";return`${Ne}-${r}${S}-${i}`}A(Lt,"stateDomId");var Pe=A((r,i,f,a,S,y,b,_)=>{e.trace("items",i),i.forEach((h)=>{switch(h.stmt){case lt:ut(r,h,f,a,S,y,b,_);break;case dt:ut(r,h,f,a,S,y,b,_);break;case Yt:{ut(r,h.state1,f,a,S,y,b,_),ut(r,h.state2,f,a,S,y,b,_);let v=b==="neo",L={id:"edge"+tt,start:h.state1.id,end:h.state2.id,arrowhead:"normal",arrowTypeEnd:v?"arrow_barb_neo":"arrow_barb",style:Zt,labelStyle:"",label:s.sanitizeText(h.description??"",t()),arrowheadStyle:te,labelpos:ee,labelType:se,thickness:re,classes:ie,look:b};S.push(L),tt++}break}})},"setupDoc"),Kt=A((r,i=qt)=>{let f=i;if(r.doc){for(let a of r.doc)if(a.stmt==="dir")f=a.value}return f},"getDir");function ht(r,i,f){if(!i.id||i.id==="</join></fork>"||i.id==="</choice>")return;if(i.cssClasses){if(!Array.isArray(i.cssCompiledStyles))i.cssCompiledStyles=[];i.cssClasses.split(" ").forEach((S)=>{let y=f.get(S);if(y)i.cssCompiledStyles=[...i.cssCompiledStyles??[],...y.styles]})}let a=r.find((S)=>S.id===i.id);if(a)Object.assign(a,i);else r.push(i)}A(ht,"insertOrUpdateNode");function le(r){return r?.classes?.join(" ")??""}A(le,"getClassesFromDbInfo");function ce(r){return r?.styles??[]}A(ce,"getStylesFromDbInfo");var ut=A((r,i,f,a,S,y,b,_)=>{let h=i.id,v=f.get(h),L=le(v),M=ce(v),Y=t();if(e.info("dataFetcher parsedItem",i,v,M),h!=="root"){let O=Ft;if(i.start===!0)O=Te;else if(i.start===!1)O=be;if(i.type!==dt)O=i.type;if(!xt.get(h))xt.set(h,{id:h,shape:O,description:s.sanitizeText(h,Y),cssClasses:`${L} ${_e}`,cssStyles:M});let T=xt.get(h);if(i.description){if(Array.isArray(T.description))T.shape=Pt,T.description.push(i.description);else if(T.description?.length&&T.description.length>0)if(T.shape=Pt,T.description===h)T.description=[i.description];else T.description=[T.description,i.description];else T.shape=Ft,T.description=i.description;T.description=s.sanitizeTextOrArray(T.description,Y)}if(T.description?.length===1&&T.shape===Pt)if(T.type==="group")T.shape=Ht;else T.shape=Ft;if(!T.type&&i.doc)e.info("Setting cluster for XCX",h,Kt(i)),T.type="group",T.isGroup=!0,T.dir=Kt(i),T.shape=i.type===Qt?jt:Ht,T.cssClasses=`${T.cssClasses} ${Ie} ${y?Oe:""}`;let G={labelStyle:"",shape:T.shape,label:T.description,cssClasses:T.cssClasses,cssCompiledStyles:[],cssStyles:T.cssStyles,id:h,dir:T.dir,domId:Lt(h,tt),type:T.type,isGroup:T.type==="group",padding:8,rx:10,ry:10,look:b,labelType:"markdown"};if(G.shape===jt)G.label="";if(r&&r.id!=="root")e.trace("Setting node ",h," to be child of its parent ",r.id),G.parentId=r.id;if(G.centerLabel=!0,i.note){let H={labelStyle:"",shape:Ee,label:i.note.text,labelType:"markdown",cssClasses:xe,cssStyles:[],cssCompiledStyles:[],id:h+Re+"-"+tt,domId:Lt(h,tt,ne),type:T.type,isGroup:T.type==="group",padding:Y.flowchart?.padding,look:b,position:i.note.position},F=h+zt,z={labelStyle:"",shape:me,label:i.note.text,cssClasses:T.cssClasses,cssStyles:[],id:h+zt,domId:Lt(h,tt,ae),type:"group",isGroup:!0,padding:16,look:b,position:i.note.position};tt++,z.id=F,H.parentId=F,ht(a,z,_),ht(a,H,_),ht(a,G,_);let P=h,K=H.id;if(i.note.position==="left of")P=H.id,K=h;S.push({id:P+"-"+K,start:P,end:K,arrowhead:"none",arrowTypeEnd:"",style:Zt,labelStyle:"",classes:Ae,arrowheadStyle:te,labelpos:ee,labelType:se,thickness:re,look:b})}else ht(a,G,_)}if(i.doc)e.trace("Adding nodes children "),Pe(i,i.doc,f,a,S,!y,b,_)},"dataFetcher"),Be=A(()=>{xt.clear(),tt=0},"reset"),R={START_NODE:"[*]",START_TYPE:"start",END_NODE:"[*]",END_TYPE:"end",COLOR_KEYWORD:"color",FILL_KEYWORD:"fill",BG_FILL:"bgFill",STYLECLASS_SEP:","},Xt=A(()=>new Map,"newClassesList"),Jt=A(()=>({relations:[],states:new Map,documents:{}}),"newDoc"),At=A((r)=>JSON.parse(JSON.stringify(r)),"clone"),qA=class{constructor(r){this.version=r,this.nodes=[],this.edges=[],this.rootDoc=[],this.classes=Xt(),this.documents={root:Jt()},this.currentDocument=this.documents.root,this.startEndCount=0,this.dividerCnt=0,this.links=new Map,this.funs=[],this.getAccTitle=E,this.setAccTitle=B,this.getAccDescription=I,this.setAccDescription=d,this.setDiagramTitle=p,this.getDiagramTitle=Q,this.clear(),this.setRootDoc=this.setRootDoc.bind(this),this.getDividerId=this.getDividerId.bind(this),this.setDirection=this.setDirection.bind(this),this.trimColon=this.trimColon.bind(this),this.bindFunctions=this.bindFunctions.bind(this)}static{A(this,"StateDB")}static{this.relationType={AGGREGATION:0,EXTENSION:1,COMPOSITION:2,DEPENDENCY:3}}extract(r){this.clear(!0);for(let a of Array.isArray(r)?r:r.doc)switch(a.stmt){case lt:this.addState(a.id.trim(),a.type,a.doc,a.description,a.note);break;case Yt:this.addRelation(a.state1,a.state2,a.description);break;case Se:this.addStyleClass(a.id.trim(),a.classes);break;case ye:this.handleStyleDef(a);break;case ge:this.setCssClass(a.id.trim(),a.styleClass);break;case"click":this.addLink(a.id,a.url,a.tooltip);break}let i=this.getStates(),f=t();Be(),ut(void 0,this.getRootDocV2(),i,this.nodes,this.edges,!0,f.look,this.classes);for(let a of this.nodes){if(!Array.isArray(a.label))continue;if(a.description=a.label.slice(1),a.isGroup&&a.description.length>0)throw Error(`Group nodes can only have label. Remove the additional description for node [${a.id}]`);a.label=a.label[0]}}handleStyleDef(r){let i=r.id.trim().split(","),f=r.styleClass.split(",");for(let a of i){let S=this.getState(a);if(!S){let y=a.trim();this.addState(y),S=this.getState(y)}if(S)S.styles=f.map((y)=>y.replace(/;/g,"")?.trim())}}setRootDoc(r){if(e.info("Setting root doc",r),this.rootDoc=r,this.version===1)this.extract(r);else this.extract(this.getRootDocV2())}docTranslator(r,i,f){if(i.stmt===Yt){this.docTranslator(r,i.state1,!0),this.docTranslator(r,i.state2,!1);return}if(i.stmt===lt)if(i.id===R.START_NODE)i.id=r.id+(f?"_start":"_end"),i.start=f;else i.id=i.id.trim();if(i.stmt!==ot&&i.stmt!==lt||!i.doc)return;let a=[],S=[];for(let y of i.doc)if(y.type===Qt){let b=At(y);b.doc=At(S),a.push(b),S=[]}else S.push(y);if(a.length>0&&S.length>0){let y={stmt:lt,id:li(),type:"divider",doc:At(S)};a.push(At(y)),i.doc=a}i.doc.forEach((y)=>this.docTranslator(i,y,!0))}getRootDocV2(){return this.docTranslator({id:ot,stmt:ot},{id:ot,stmt:ot,doc:this.rootDoc},!0),{id:ot,doc:this.rootDoc}}addState(r,i=dt,f=void 0,a=void 0,S=void 0,y=void 0,b=void 0,_=void 0){let h=r?.trim();if(!this.currentDocument.states.has(h))e.info("Adding state ",h,a),this.currentDocument.states.set(h,{stmt:lt,id:h,descriptions:[],type:i,doc:f,note:S,classes:[],styles:[],textStyles:[]});else{let v=this.currentDocument.states.get(h);if(!v)throw Error(`State not found: ${h}`);if(!v.doc)v.doc=f;if(!v.type)v.type=i}if(a)e.info("Setting state description",h,a),(Array.isArray(a)?a:[a]).forEach((L)=>this.addDescription(h,L.trim()));if(S){let v=this.currentDocument.states.get(h);if(!v)throw Error(`State not found: ${h}`);v.note=S,v.note.text=s.sanitizeText(v.note.text,t())}if(y)e.info("Setting state classes",h,y),(Array.isArray(y)?y:[y]).forEach((L)=>this.setCssClass(h,L.trim()));if(b)e.info("Setting state styles",h,b),(Array.isArray(b)?b:[b]).forEach((L)=>this.setStyle(h,L.trim()));if(_)e.info("Setting state styles",h,b),(Array.isArray(_)?_:[_]).forEach((L)=>this.setTextStyle(h,L.trim()))}clear(r){if(this.nodes=[],this.edges=[],this.funs=[this.setupToolTips.bind(this)],this.documents={root:Jt()},this.currentDocument=this.documents.root,this.startEndCount=0,this.classes=Xt(),!r)this.links=new Map,C()}getState(r){return this.currentDocument.states.get(r)}getStates(){return this.currentDocument.states}logDocuments(){e.info("Documents = ",this.documents)}getRelations(){return this.currentDocument.relations}addLink(r,i,f){this.links.set(r,{url:i,tooltip:f}),e.warn("Adding link",r,i,f)}getLinks(){return this.links}startIdIfNeeded(r=""){if(r===R.START_NODE)return this.startEndCount++,`${R.START_TYPE}${this.startEndCount}`;return r}startTypeIfNeeded(r="",i=dt){return r===R.START_NODE?R.START_TYPE:i}endIdIfNeeded(r=""){if(r===R.END_NODE)return this.startEndCount++,`${R.END_TYPE}${this.startEndCount}`;return r}endTypeIfNeeded(r="",i=dt){return r===R.END_NODE?R.END_TYPE:i}addRelationObjs(r,i,f=""){let a=this.startIdIfNeeded(r.id.trim()),S=this.startTypeIfNeeded(r.id.trim(),r.type),y=this.startIdIfNeeded(i.id.trim()),b=this.startTypeIfNeeded(i.id.trim(),i.type);this.addState(a,S,r.doc,r.description,r.note,r.classes,r.styles,r.textStyles),this.addState(y,b,i.doc,i.description,i.note,i.classes,i.styles,i.textStyles),this.currentDocument.relations.push({id1:a,id2:y,relationTitle:s.sanitizeText(f,t())})}addRelation(r,i,f){if(typeof r==="object"&&typeof i==="object")this.addRelationObjs(r,i,f);else if(typeof r==="string"&&typeof i==="string"){let a=this.startIdIfNeeded(r.trim()),S=this.startTypeIfNeeded(r),y=this.endIdIfNeeded(i.trim()),b=this.endTypeIfNeeded(i);this.addState(a,S),this.addState(y,b),this.currentDocument.relations.push({id1:a,id2:y,relationTitle:f?s.sanitizeText(f,t()):void 0})}}addDescription(r,i){let f=this.currentDocument.states.get(r),a=i.startsWith(":")?i.replace(":","").trim():i;f?.descriptions?.push(s.sanitizeText(a,t()))}cleanupLabel(r){return r.startsWith(":")?r.slice(2).trim():r.trim()}getDividerId(){return this.dividerCnt++,`divider-id-${this.dividerCnt}`}addStyleClass(r,i=""){if(!this.classes.has(r))this.classes.set(r,{id:r,styles:[],textStyles:[]});let f=this.classes.get(r);if(i&&f)i.split(R.STYLECLASS_SEP).forEach((a)=>{let S=a.replace(/([^;]*);/,"$1").trim();if(RegExp(R.COLOR_KEYWORD).exec(a)){let b=S.replace(R.FILL_KEYWORD,R.BG_FILL).replace(R.COLOR_KEYWORD,R.FILL_KEYWORD);f.textStyles.push(b)}f.styles.push(S)})}getClasses(){return this.classes}setupToolTips(r){let i=Ce();u(r).select("svg").selectAll("g.node, g.rough-node").on("mouseover",(S)=>{let y=u(S.currentTarget),b=y.attr("title");if(b===null)return;let _=S.currentTarget?.getBoundingClientRect();i.transition().duration(200).style("opacity",".9"),i.style("left",window.scrollX+_.left+(_.right-_.left)/2+"px").style("top",window.scrollY+_.bottom+"px"),i.html(iA.sanitize(b)),y.classed("hover",!0)}).on("mouseout",(S)=>{i.transition().duration(500).style("opacity",0),u(S.currentTarget).classed("hover",!1)})}setCssClass(r,i){r.split(",").forEach((f)=>{let a=this.getState(f);if(!a){let S=f.trim();this.addState(S),a=this.getState(S)}a?.classes?.push(i)})}setStyle(r,i){this.getState(r)?.styles?.push(i)}setTextStyle(r,i){this.getState(r)?.textStyles?.push(i)}bindFunctions(r){this.funs.forEach((i)=>{i(r)})}getDirectionStatement(){return this.rootDoc.find((r)=>r.stmt===Wt)}getDirection(){return this.getDirectionStatement()?.value??pe}setDirection(r){let i=this.getDirectionStatement();if(i)i.value=r;else this.rootDoc.unshift({stmt:Wt,value:r})}trimColon(r){return r.startsWith(":")?r.slice(1).trim():r.trim()}getData(){let r=t();return{nodes:this.nodes,edges:this.edges,other:{},config:r,direction:oe(this.getRootDocV2())}}getConfig(){return t().state}},Ye=A((r)=>`
defs [id$="-barbEnd"] {
    fill: ${r.transitionColor};
    stroke: ${r.transitionColor};
  }
g.stateGroup text {
  fill: ${r.nodeBorder};
  stroke: none;
  font-size: 10px;
}
g.stateGroup text {
  fill: ${r.textColor};
  stroke: none;
  font-size: 10px;

}
g.stateGroup .state-title {
  font-weight: bolder;
  fill: ${r.stateLabelColor};
}

g.stateGroup rect {
  fill: ${r.mainBkg};
  stroke: ${r.nodeBorder};
}

g.stateGroup line {
  stroke: ${r.lineColor};
  stroke-width: ${r.strokeWidth||1};
}

.transition {
  stroke: ${r.transitionColor};
  stroke-width: ${r.strokeWidth||1};
  fill: none;
}

.stateGroup .composit {
  fill: ${r.background};
  border-bottom: 1px
}

.stateGroup .alt-composit {
  fill: #e0e0e0;
  border-bottom: 1px
}

.state-note {
  stroke: ${r.noteBorderColor};
  fill: ${r.noteBkgColor};

  text {
    fill: ${r.noteTextColor};
    stroke: none;
    font-size: 10px;
  }
}

.stateLabel .box {
  stroke: none;
  stroke-width: 0;
  fill: ${r.mainBkg};
  opacity: 0.5;
}

.edgeLabel .label rect {
  fill: ${r.labelBackgroundColor};
  opacity: 0.5;
}
.edgeLabel {
  background-color: ${r.edgeLabelBackground};
  p {
    background-color: ${r.edgeLabelBackground};
  }
  rect {
    opacity: 0.5;
    background-color: ${r.edgeLabelBackground};
    fill: ${r.edgeLabelBackground};
  }
  text-align: center;
}
.edgeLabel .label text {
  fill: ${r.transitionLabelColor||r.tertiaryTextColor};
}
.label div .edgeLabel {
  color: ${r.transitionLabelColor||r.tertiaryTextColor};
}

.stateLabel text {
  fill: ${r.stateLabelColor};
  font-size: 10px;
  font-weight: bold;
}

.node circle.state-start {
  fill: ${r.specialStateColor};
  stroke: ${r.specialStateColor};
}

.node .fork-join {
  fill: ${r.specialStateColor};
  stroke: ${r.specialStateColor};
}

.node circle.state-end {
  fill: ${r.innerEndBackground};
  stroke: ${r.background};
  stroke-width: 1.5
}
.end-state-inner {
  fill: ${r.compositeBackground||r.background};
  // stroke: ${r.background};
  stroke-width: 1.5
}

.node rect {
  fill: ${r.stateBkg||r.mainBkg};
  stroke: ${r.stateBorder||r.nodeBorder};
  stroke-width: ${r.strokeWidth||1}px;
}
.node polygon {
  fill: ${r.mainBkg};
  stroke: ${r.stateBorder||r.nodeBorder};;
  stroke-width: ${r.strokeWidth||1}px;
}
[id$="-barbEnd"] {
  fill: ${r.lineColor};
}

.statediagram-cluster rect {
  fill: ${r.compositeTitleBackground};
  stroke: ${r.stateBorder||r.nodeBorder};
  stroke-width: ${r.strokeWidth||1}px;
}

.cluster-label, .nodeLabel {
  color: ${r.stateLabelColor};
  // line-height: 1;
}

.statediagram-cluster rect.outer {
  rx: 5px;
  ry: 5px;
}
.statediagram-state .divider {
  stroke: ${r.stateBorder||r.nodeBorder};
}

.statediagram-state .title-state {
  rx: 5px;
  ry: 5px;
}
.statediagram-cluster.statediagram-cluster .inner {
  fill: ${r.compositeBackground||r.background};
}
.statediagram-cluster.statediagram-cluster-alt .inner {
  fill: ${r.altBackground?r.altBackground:"#efefef"};
}

.statediagram-cluster .inner {
  rx:0;
  ry:0;
}

.statediagram-state rect.basic {
  rx: 5px;
  ry: 5px;
}
.statediagram-state rect.divider {
  stroke-dasharray: 10,10;
  fill: ${r.altBackground?r.altBackground:"#efefef"};
}

.note-edge {
  stroke-dasharray: 5;
}

.statediagram-note rect {
  fill: ${r.noteBkgColor};
  stroke: ${r.noteBorderColor};
  stroke-width: 1px;
  rx: 0;
  ry: 0;
}
.statediagram-note rect {
  fill: ${r.noteBkgColor};
  stroke: ${r.noteBorderColor};
  stroke-width: 1px;
  rx: 0;
  ry: 0;
}

.statediagram-note text {
  fill: ${r.noteTextColor};
}

.statediagram-note .nodeLabel {
  color: ${r.noteTextColor};
}
.statediagram .edgeLabel {
  color: red; // ${r.noteTextColor};
}

[id$="-dependencyStart"], [id$="-dependencyEnd"] {
  fill: ${r.lineColor};
  stroke: ${r.lineColor};
  stroke-width: ${r.strokeWidth||1};
}

.statediagramTitleText {
  text-anchor: middle;
  font-size: 18px;
  fill: ${r.textColor};
}

[data-look="neo"].statediagram-cluster rect {
  fill: ${r.mainBkg};
  stroke: ${r.useGradient?"url("+r.svgId+"-gradient)":r.stateBorder||r.nodeBorder};
  stroke-width: ${r.strokeWidth??1};
}
[data-look="neo"].statediagram-cluster rect.outer {
  rx: ${r.radius}px;
  ry: ${r.radius}px;
  filter: ${r.dropShadow?r.dropShadow.replace("url(#drop-shadow)",`url(${r.svgId}-drop-shadow)`):"none"}
}
`,"getStyles"),mt=Ye;
export{ft,hi,qA,mt};
