const cursor = document.querySelector(".cursor");


document.addEventListener("mousemove",(e)=>{

cursor.style.left=e.clientX+"px";
cursor.style.top=e.clientY+"px";

});





const cards=document.querySelectorAll(".card");


cards.forEach(card=>{


card.addEventListener("mousemove",(e)=>{


let x=
(e.offsetX-card.clientWidth/2)/20;


let y=
(e.offsetY-card.clientHeight/2)/20;



card.style.transform=
`rotateX(${-y}deg) rotateY(${x}deg) translateY(-20px)`;


});



card.addEventListener("mouseleave",()=>{


card.style.transform="";


});


});