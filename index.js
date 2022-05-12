#!/bin/env gjs
function showError(error){
    console.log(error)
}

//Imports
imports.gi.versions.Soup= '2.4';
imports.gi.versions.Gtk = '3.0';
const Gtk = imports.gi.Gtk;
const Soup = imports.gi.Soup;
const GLib = imports.gi.GLib;
const byteArray = imports.byteArray;
//init shit
Gtk.init(null);
let win = new Gtk.Window({
    type: Gtk.WindowType.TOPLEVEL,
    title: 'Retaped',
    default_width: 600,
    default_height: 400,
    window_position: Gtk.WindowPosition.CENTER,
});
win.title = 'Retaped';
function onDeleteEvent() { log('delete-event emitted'); return false; }
win.connect('delete-event', onDeleteEvent);
win.connect('destroy', () => { Gtk.main_quit(); });

//Setting up layout
const loginoe = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
const logged = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL})
const servers = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
const channels = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
const messagesContainer = new Gtk.ScrolledWindow({expand: true});
const messages = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL})
const messageSendGUI = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL})
const messageArea = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, expand:true})
let embedbutton = new Gtk.Button({label: "Embed"})
let sendmessagefield = new Gtk.Entry({buffer: new Gtk.EntryBuffer()})
let sendbutton = new Gtk.Button({label: "Send"})
sendbutton.connect("clicked", () => sendmessage())
messageSendGUI.add(embedbutton)
messageSendGUI.add(sendmessagefield)
messageSendGUI.add(sendbutton)
messagesContainer['max-content-width']=500
messagesContainer.add(messages)
messageArea.add(messagesContainer)
messageArea.add(messageSendGUI)
logged.add(servers);
logged.add(channels);
logged.add(messageArea);
let tokeninput = new Gtk.Entry({buffer: new Gtk.EntryBuffer()})
loginoe.add(tokeninput);
let loginbutton = new Gtk.Button({label: 'Log in',visible: true,valign: Gtk.Align.CENTER,halign: Gtk.Align.CENTER,});
loginbutton.connect('clicked', () => login());
loginoe.add(loginbutton);
win.add(loginoe)
win.show_all();

//Defining global variables
let thetoken="";
let socket;
let thechannel;
let theserver;
let channelcache=[];
let channellist=[];
let uIDs=[];
let usernames=[];
let lastmessage;
let msgcache=[];
let msglist=[];
let reply;
const session=new Soup.Session()
var _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());
let soupSyncSession = new Soup.SessionSync();

try{
let [ok, contents] = GLib.file_get_contents(GLib.get_user_config_dir()+'/retaped-token')
    thetoken=contents.toString()
    login()
}catch(e){}

Gtk.main();
//Mostly copy-pasted from Retaped (which is a fork of Reduct by DoruDolasu) and then edited to work in GJS
async function login() {
    try{
        if(!thetoken){
            thetoken=tokeninput.get_buffer().get_text()
        }
    win.remove(loginoe)
    win.add(logged)
    const message = new Soup.Message({
        method: 'GET',
        uri: Soup.URI.new('wss://ws.revolt.chat')
    });
    session.websocket_connect_async(message, 'origin', [], null, bonfire);
    if(fetch("https://api.revolt.chat/users/@me")){
        GLib.file_set_contents(GLib.get_user_config_dir()+'/retaped-token',thetoken)
    }
    showError("Started websocket")
    loginoe.hidden=true;
    //if (!document.getElementById("inputTheme").value == '') { document.cookie = `theme=${document.getElementById("inputTheme").value};` }
    //if (document.cookie) { let theme = document.cookie.split('; ').find(row => row.startsWith('theme=')).split('=')[1]; }

}catch(error){showError(error)}
}

async function bonfire(_session, res) {
    socket = session.websocket_connect_finish(res);

    socket.connect('message', async (self, type, data) => {
        try{
        if (type !== Soup.WebsocketDataType.TEXT)
            return;

        const str = byteArray.toString(byteArray.fromGBytes(data));
        thedata = JSON.parse(str)
        if (thedata.type == "Authenticated") {
            showError("Connected")
        } else if (thedata.type == "Message") {
            if (thedata.channel == thechannel) {
                parsemessage(thedata);
                messages.show_all()
            }
        } else if (thedata.type == "Pong") {
            pong()
        } else if (thedata.type == "Error") {
            if (thedata.error == "InvalidSession") { showError("INVALID TOKEN"); } else { showError(thedata.error); }
        } else if (thedata.type == "Ready") {
            await getserver(thedata.servers);
            for(let i=0; i<thedata.channels.length;i++){
                channellist.push(thedata.channels[i]._id);
                channelcache.push(thedata.channels[i])
            }
        }}catch(error){showError(error)}
    });

    socket.connect('error', (self, type, data) => {
        if(type!== Soup.WebsocketDataType.TEXT) return;
        showError("Disconnected")
    });
        socket.send_text(`{
            "type": "Authenticate",
            "token": "${thetoken}"
        }`);
}

 async function getserver(server) {
    for (let i = 0; i < server.length; i++) {
        let tmp = new Gtk.Button({
            label: server[i].name,
            // Set visible to 'true' if you don't want to call button.show() later
            visible: true,
            // Another example of constant mapping:
            //     'Gtk' and 'Align' are taken from the GtkAlign enum,
            //     'CENTER' from the constant GTK_ALIGN_CENTER
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });
        tmp.connect('clicked', () => {theserver=server[i]._id; getchannel()})
        servers.add(tmp)
    }
    logged.show_all()
}

function fetch(url){
    let message=Soup.Message.new("GET",url)
    message.request_headers.append("x-session-token", thetoken)
    soupSyncSession.send_message(message);
    return JSON.parse(message['response-body'].data)
}

function post(url, data){
    let message=Soup.Message.new("POST",url)
    message.set_request("application/json",2,data)
    message.request_headers.append("x-session-token", thetoken)
    return soupSyncSession.send_message(message);
}

function getchannel() {
    children=channels.get_children();
    for(let i=0;i<children.length;i++){
        channels.remove(children[i])
    }
    chann=fetch(`https://api.revolt.chat/servers/${theserver}`).channels;
    for (let i = 0; i < chann.length; i++) {
            let tmp= new Gtk.Button({
                label: channelcache[channellist.indexOf(chann[i])].name,
                visible: true,
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER
            })
            tmp.connect('clicked', () => {
                thechannel = chann[i];
                clearmessages();
                getmessage();
            })
            channels.add(tmp)
        }
    logged.show_all()
}

function clearmessages(){
    children=messages.get_children();
    for(let i=0;i<children.length;i++){
        messages.remove(children[i])
    }
}
function parsemessage(message) {
    let username = ""
    let content=message.content
    const replies=new Gtk.Box({orientation: Gtk.Orientation.VERTICAL})
    if (message.masquerade) {
        username = message.masquerade.name;
    } else if (uIDs.indexOf(message.author) === -1) {
        let data = fetch(`https://api.revolt.chat/users/${message.author}`)
        username = data.username
        usernames.push(data.username)
        uIDs.push(data._id)
    } else {
        username = usernames[uIDs.indexOf(message.author)]
    }
    if(content.search(/<@[A-Za-z0-9]{26}>/) != -1) {
        pings = /<@[^@<>]{26}>/[Symbol.match](content)
        for (let i = 0; i < pings.length; i++) {
                content = message.content.replace(pings[i], `@${usernames[uIDs.indexOf(/[^@<>]{26}/)[Symbol.match][pings[i]][0]]}`)
        }
    }
    if(message.replies){
        for(let i=0;i<message.replies.length;i++){
            if(msglist.indexOf(message.replies[i])!==-1){
                replies.add(new Gtk.Label({label: `╔══> ${msgcache[msglist.indexOf(message.replies[i])]}`,halign: Gtk.Align.START}))
            }else{
                replies.add(new Gtk.Label({label: `╔══> <i>Unloaded message</i>`, useMarkup: true}))
            }
        }
    }
    if(message.replies){
        messages.add(replies)
    }
    if(lastmessage!==username){
        messages.add(new Gtk.Label({
            useMarkup: true,
            label: `<b>${username}</b>`,
            halign: Gtk.Align.START
        }))
    }
    messages.add(new Gtk.Label({
        label: content,
        halign: Gtk.Align.START
    }))
    messages.add(new Gtk.Label({label: ""}))
    lastmessage=username;
    msgcache.push(content)
    msglist.push(message._id)
}

function getmessage() {
    let mess=fetch(`https://api.revolt.chat/channels/${thechannel}/messages?limit=20`)
    mess.reverse()
    for (let i = 1; i <= mess.length; i++) {
        parsemessage(mess[i - 1])
    }
    logged.show_all()
}

function sendmessage() {
    message = sendmessagefield.get_buffer().get_text()
    if(message!==""){
        if (message.search(/[ \n]?@[^ ]*/) != -1) {
            pings = /@[^ ]*/[Symbol.match](message)
            for (let i = 0; i < pings.length; i++) {
                message = message.replace(pings[i], `<@${uIDs[usernames.indexOf(pings[i].replace("@", ""))]}>`)
            }
        }
            showError(post(`https://api.revolt.chat/channels/${thechannel}/messages`,`{"content":"${message.replace('"','\\"')}"}`))
            sendmessagefield.get_buffer().set_text("",-1)
    }
    }
