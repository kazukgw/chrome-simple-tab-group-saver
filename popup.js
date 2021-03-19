const colorCode = {
  "grey": "#bec1c5",
  "blue": "#94b3f2",
  "red": "#e38f86",
  "yellow": "#f6d675",
  "green": "#92c699",
  "pink": "#ee92c8",
  "purple": "#cfb1f6",
  "cyan": "#92d8e9"
};

const TabGroups = {
  getInactives: () => {
    return new Promise((res, rej) => {
      chrome.storage.sync.get(null, (data) => {
        res(data);
      });
    });
  },

  getActives: () => {
    return new Promise((res, rej) => {
      chrome.tabGroups.query({}, (tgList) => {
        const tgs = tgList.reduce((acc, tg) => {
          const tgid = _btoa(tg.title);
          tg.tgid = tgid;
          acc[tgid] = tg;
          return acc;
        }, {});
        return res(tgs);
      });
    })
  },

  deactivateTabGroup: (tgid) => {
    return new Promise((res, rej) => {
      TabGroups.getActives().then((tgs) => {
        const tg = tgs[tgid]
        if (tg == null) {
          return rej("error");
        }
        return res(tg);
      })
    })
      .then((tg) => {
        return new Promise((res, rej) => {
          chrome.tabs.query({}, (tabs) => {
            tg.tabs = tabs
              .filter((t) => { return tg.id === t.groupId })
              .map((t) => { return { id: t.id, url: t.url, favIconUrl: t.favIconUrl, title: t.title } });
            return res(tg);
          });
        });
      })
      .then((tg) => {
        return new Promise((res, rej) => {
          const data = {};
          data[tgid] = tg;
          chrome.storage.sync.set(data, () => {
            return res(tg);
          });
        });
      })
      .then((tg) => {
        return new Promise((res, rej) => {
          chrome.tabs.remove(tg.tabs.map((tab) => tab.id), () => {
            return res(tg);
          });
        });
      });
  },

  deleteInactiveTabGroup: (tgid) => {
    return new Promise((res, rej) => {
      chrome.storage.sync.remove(tgid, () => { res() });
    });
  },

  activateTabGroup: (tgid) => {
    return new Promise((res, rej) => {
      TabGroups.getInactives().then((tgs) => {
        const tg = tgs[tgid];
        if (tg == null) {
          return rej();
        }
        return res(tg)
      });
    })
      .then((tg) => {
        const promises = [];
        return new Promise((res, rej) => {
          tg.tabs.forEach((tab) => {
            promises.push(
              new Promise((_res, _) => {
                const url = `javascript:(()=>{
                document.querySelector('head').insertAdjacentHTML('beforeend', '<title>${tab.title}</title>');
                document.addEventListener('visibilitychange', ()=>{window.location.href="${tab.url}"});
              })() `;
                chrome.tabs.create({ url: url, active: false }, (t) => { _res(t) });
              })
            );
          });
          return Promise.all(promises).then((tabs) => {
            const tabIds = tabs.map((t) => t.id);
            chrome.tabs.group({ tabIds: tabIds }, (groupId) => {
              chrome.tabGroups.update(groupId, { title: tg.title, color: tg.color, collapsed: true }, () => {
                chrome.storage.sync.remove(tg.tgid);
                return res(tg);
              });
            });
          });
        });
      });
  }
}

class UITabGroupBox {
  constructor(activeBoxElem, inactiveBoxElem) {
    this.$active = activeBoxElem;
    this.$inactive = inactiveBoxElem;
    this.reset();
  }

  reset() {
    TabGroups.getActives().then((tgs) => {
      this.$active.innerHTML = '';
      Object.values(tgs).forEach((tg) => {
        this.addActive(tg);
      });
      this.$active.querySelectorAll(".tab-group")
        .forEach((el) => {
          el.addEventListener("click", this.deactivate.bind(this), false);
        });
    });

    TabGroups.getInactives().then((tgs) => {
      this.$inactive.innerHTML = '';
      Object.values(tgs).forEach((tg) => {
        this.addInactive(tg);
      });
      this.$inactive.querySelectorAll(".tab-group")
        .forEach((el) => {
          el.addEventListener("click", this.activate.bind(this), false);
        });
      this.$inactive.querySelectorAll(".close-button")
        .forEach((el) => {
          el.addEventListener("click", this.deleteInactiveTabGroup.bind(this), false);
        });
    });
  }

  activate(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    const elem = ev.currentTarget;
    const tgid = elem.getAttribute("id");
    TabGroups.activateTabGroup(tgid).then((tg) => {
      this.reset();
    }, (reason) => { console.log(reason); });
  }

  deactivate(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    const elem = ev.currentTarget;
    const tgid = elem.getAttribute("id");
    TabGroups.deactivateTabGroup(tgid).then((tg) => {
      this.reset();
    }, (reason) => { console.log(reason); });
  }

  addActive(tg) {
    const id = tg.tgid;
    const style = `background-color: ${colorCode[tg.color]}`;
    const html = `
    <div class="tab-group-container">
      <div id="${id}" class="tab-group">
        <div class="circle" style="${style}"></div>
        <div class="tab-group-title">${tg.title}</div>
      </div>
    </div>`;
    this.$active.insertAdjacentHTML("beforeend", html);
  }

  addInactive(tg) {
    const id = tg.tgid;
    const style = `background-color: ${colorCode[tg.color]}`;
    const html = `
    <div class="tab-group-container">
      <div id="${id}" class="tab-group dark">
        <div class="circle" style="${style}"></div>
        <div class="tab-group-title">${tg.title}</div>
      </div>
      <div data-tgid="${id}" class="icon-box close-button"><span class="icon-close"></span></div>
    </div>`;
    this.$inactive.insertAdjacentHTML("beforeend", html);
  }

  deleteInactiveTabGroup(ev) {
    const elem = ev.currentTarget;
    const tgid = elem.getAttribute("data-tgid");
    TabGroups.deleteInactiveTabGroup(tgid).then(() => {
      this.reset();
    });
  }
}

(() => {
  const ui = new UITabGroupBox(
    document.querySelector("#active-tab-group-box"),
    document.querySelector("#inactive-tab-group-box")
  );
})();

function _btoa(str) {
  return window.btoa(unescape(encodeURIComponent(str))).replaceAll("=", "-");
}

