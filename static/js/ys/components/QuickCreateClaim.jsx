import React from 'react'
import { Form, Text } from 'react-form';
import TitleText from './TitleText'
import { config } from '../config'


export default class QuickCreateClaim extends React.Component {
  state = {submitting: false}

  submit = (values, e, formApi) => {
    this.setState({submitting: true});
    this.props.onSubmit(values).then(
      (val) => {
        this.setState({submitting: false});
        formApi.resetAll();
      },
      (err) => {
        this.setState({submitting: false});
      });
  }

  submitButton = () => {
    if (this.state.submitting) {
      return <span>Adding your point...</span>;
    } else {
      return <button onClick={this.props.onClick} className="buttonUX2 buttonUX2Blue  homePageNewPointCallButton pull-right" type="submit">Publish</button>;
    }
  }

  render(){
    let props = this.props;
    return <Form onSubmit={this.submit}
                 validate={this.errorValidator}
                 dontValidateOnMount={true}>
      { formApi => (
          <form onSubmit={formApi.submitForm} id="mainPageClaimCreationForm">
            <TitleText id="newPointTextField" className="addEvidenceFormTextField" placeholder='Make a claim, eg "Dogs can learn more tricks than cats."' />
            <div className="claimTextButtonsArea">
              {this.submitButton()}
            </div>
          </form>
      )}
    </Form>;
  }
}
