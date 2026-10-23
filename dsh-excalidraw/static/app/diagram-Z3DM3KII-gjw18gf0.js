import{F}from"./main-ccczzhfx.js";import{A,e,f,l,D,C,B,E,d,I,p,Q,v,b}from"./main-hnttsvkj.js";import{N}from"./main-x4g69c60.js";var W=f.packet,S=class{constructor(){this.packet=[],this.setAccTitle=B,this.getAccTitle=E,this.setDiagramTitle=p,this.getDiagramTitle=Q,this.getAccDescription=I,this.setAccDescription=d}static{A(this,"PacketDB")}getConfig(){let t=b({...W,...l().packet});if(t.showBits)t.paddingY+=10;return t}getPacket(){return this.packet}pushWord(t){if(t.length>0)this.packet.push(t)}clear(){C(),this.packet=[]}},_=1e4,L=A((t,r)=>{F(t,r);let o=-1,i=[],c=1,{bitsPerRow:g}=r.getConfig();for(let{start:a,end:n,bits:k,label:h}of t.blocks){if(a!==void 0&&n!==void 0&&n<a)throw Error(`Packet block ${a} - ${n} is invalid. End must be greater than start.`);if(a??=o+1,a!==o+1)throw Error(`Packet block ${a} - ${n??a} is not contiguous. It should start from ${o+1}.`);if(k===0)throw Error(`Packet block ${a} is invalid. Cannot have a zero bit field.`);n??=a+(k??1)-1,k??=n-a+1,o=n,e.debug(`Packet block ${a} - ${o} with label ${h}`);while(i.length<=g+1&&r.getPacket().length<_){let[m,s]=M({start:a,end:n,bits:k,label:h},c,g);if(i.push(m),m.end+1===c*g)r.pushWord(i),i=[],c++;if(!s)break;({start:a,end:n,bits:k,label:h}=s)}}r.pushWord(i)},"populate"),M=A((t,r,o)=>{if(t.start===void 0)throw Error("start should have been set during first phase");if(t.end===void 0)throw Error("end should have been set during first phase");if(t.start>t.end)throw Error(`Block start ${t.start} is greater than block end ${t.end}.`);if(t.end+1<=r*o)return[t,void 0];let i=r*o-1,c=r*o;return[{start:t.start,end:i,label:t.label,bits:i-t.start},{start:c,end:t.end,label:t.label,bits:t.end-c}]},"getNextFittingBlock"),T={parser:{yy:void 0},parse:A(async(t)=>{let r=await N("packet",t),o=T.parser?.yy;if(!(o instanceof S))throw Error("parser.parser?.yy was not a PacketDB. This is due to a bug within Mermaid, please report this issue at https://github.com/mermaid-js/mermaid/issues.");e.debug(r),L(r,o)},"parse")},Y=A((t,r,o,i)=>{let c=i.db,g=c.getConfig(),{rowHeight:a,paddingY:n,bitWidth:k,bitsPerRow:h}=g,m=c.getPacket(),s=c.getDiagramTitle(),w=a+n,u=w*(m.length+1)-(s?0:a),x=k*h+2,y=v(r);y.attr("viewBox",`0 0 ${x} ${u}`),D(y,u,x,g.useMaxWidth);for(let[P,z]of m.entries())O(y,z,P,g);y.append("text").text(s).attr("x",x/2).attr("y",u-w/2).attr("dominant-baseline","middle").attr("text-anchor","middle").attr("class","packetTitle")},"draw"),O=A((t,r,o,{rowHeight:i,paddingX:c,paddingY:g,bitWidth:a,bitsPerRow:n,showBits:k})=>{let h=t.append("g"),m=o*(i+g)+g;for(let s of r){let w=s.start%n*a+1,u=(s.end-s.start+1)*a-c;if(h.append("rect").attr("x",w).attr("y",m).attr("width",u).attr("height",i).attr("class","packetBlock"),h.append("text").attr("x",w+u/2).attr("y",m+i/2).attr("class","packetLabel").attr("dominant-baseline","middle").attr("text-anchor","middle").text(s.label),!k)continue;let x=s.end===s.start,y=m-2;if(h.append("text").attr("x",w+(x?u/2:0)).attr("y",y).attr("class","packetByte start").attr("dominant-baseline","auto").attr("text-anchor",x?"middle":"start").text(s.start),!x)h.append("text").attr("x",w+u).attr("y",y).attr("class","packetByte end").attr("dominant-baseline","auto").attr("text-anchor","end").text(s.end)}},"drawWord"),j={draw:Y},G={byteFontSize:"10px",startByteColor:"black",endByteColor:"black",labelColor:"black",labelFontSize:"12px",titleColor:"black",titleFontSize:"14px",blockStrokeColor:"black",blockStrokeWidth:"1",blockFillColor:"#efefef"},H=A(({packet:t}={})=>{let r=b(G,t);return`
	.packetByte {
		font-size: ${r.byteFontSize};
	}
	.packetByte.start {
		fill: ${r.startByteColor};
	}
	.packetByte.end {
		fill: ${r.endByteColor};
	}
	.packetLabel {
		fill: ${r.labelColor};
		font-size: ${r.labelFontSize};
	}
	.packetTitle {
		fill: ${r.titleColor};
		font-size: ${r.titleFontSize};
	}
	.packetBlock {
		stroke: ${r.blockStrokeColor};
		stroke-width: ${r.blockStrokeWidth};
		fill: ${r.blockFillColor};
	}
	`},"styles"),Z={parser:T,get db(){return new S},renderer:j,styles:H};export{Z as diagram};
